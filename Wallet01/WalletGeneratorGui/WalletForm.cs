using System.Text.Json;
using Nethereum.HdWallet;
using Nethereum.Signer;
using Nethereum.Util;
using Nethereum.Web3;
using NBitcoin;

namespace WalletGeneratorGui;

public partial class WalletForm : Form
{
    private static readonly RpcNetworkPreset[] NetworkPresets =
    [
        new("Sepolia Testnet", "https://sepolia.drpc.org"),
        new("Ethereum Mainnet", "https://eth.drpc.org")
    ];

    private readonly object _walletLock = new();
    private readonly string _walletBookFilePath;
    private readonly string _walletVaultFilePath;
    private readonly List<WalletEntry> _walletEntries = [];
    private string? _privateKey;
    private string? _address;
    private LocalJsonRpcServer? _jsonRpcServer;
    private bool _suppressNetworkSync;
    /// <summary>시작 시 설정한 BIP39 패스프레이즈. 디스크에 저장하지 않으며 폼 종료 시 비웁니다.</summary>
    private string? _bip39SessionPassphrase;
    private bool _startupBootstrapCompleted;

    public WalletForm()
    {
        _walletBookFilePath = Path.Combine(AppContext.BaseDirectory, "walletbook.json");
        _walletVaultFilePath = Path.Combine(AppContext.BaseDirectory, "walletvault.json");
        InitializeComponent();
        InitializeNetworkOptions();
        LoadWalletBook();
        if (_walletEntries.Count == 0)
        {
            buttonCreateWallet.Enabled = false;
            buttonUnlockWallet.Enabled = false;
            labelWalletState.Text = "지갑 상태: 첫 실행 — 아래 안내에 따라 패스워드 설정과 지갑·니모닉 백업을 이어서 진행합니다.";
        }
        else
        {
            labelWalletState.Text = "지갑 상태: 없음 (새 지갑 생성 또는 지갑 불러오기)";
        }

        Shown += WalletForm_Shown;
    }

    private void WalletForm_Shown(object? sender, EventArgs e)
    {
        if (_startupBootstrapCompleted)
        {
            return;
        }

        _startupBootstrapCompleted = true;
        if (!RunStartupBootstrap())
        {
            BeginInvoke(Close);
        }
    }

    private static bool IsHdWalletBookSource(string source) =>
        string.Equals(source, "생성", StringComparison.Ordinal) ||
        string.Equals(source, "Mnemonic 가져오기", StringComparison.Ordinal);

    private bool RunStartupBootstrap()
    {
        var needsHdUnlock = _walletEntries.Any(e => IsHdWalletBookSource(e.Source));

        if (_walletEntries.Count == 0)
        {
            MessageBox.Show(
                "처음 실행입니다.\n\n" +
                "• 먼저 시작 패스워드를 설정합니다. 패스워드 자체는 파일로 저장되지 않습니다.\n" +
                "• 이어서 새 지갑이 만들어지고, Mnemonic(니모닉) 12단어가 표시됩니다.\n" +
                "• 니모닉을 오프라인에 저장했다고 확인해야만 다음 단계로 진행할 수 있습니다.\n\n" +
                "위 순서는 한 번에 이어서 진행됩니다.",
                "시작 안내",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);

            using (var pwd = new PasswordSetupDialog())
            {
                if (pwd.ShowDialog(this) != DialogResult.OK)
                {
                    return false;
                }

                _bip39SessionPassphrase = pwd.Passphrase;
            }

            if (!ExecuteNewWalletCreationWithMnemonicBackupAsync(
                    requireMnemonicOfflineAck: true,
                    promptPasswordIfUnset: false)
                .GetAwaiter()
                .GetResult())
            {
                return false;
            }

            EnableMainWalletActionsAfterFirstSetup();
            labelWalletState.Text =
                "지갑 상태: 첫 설정 완료. 다른 지갑은 「새 지갑 생성」, 기존 지갑은 「지갑 불러오기」를 사용하세요.";
            return true;
        }

        if (!needsHdUnlock)
        {
            var r = MessageBox.Show(
                "저장된 주소는 Private Key 출처입니다. 이후 니모닉 지갑에 쓸 시작 패스워드를 설정합니다.",
                "시작",
                MessageBoxButtons.OKCancel,
                MessageBoxIcon.Information);
            if (r != DialogResult.OK)
            {
                return false;
            }

            using (var pwd = new PasswordSetupDialog())
            {
                if (pwd.ShowDialog(this) != DialogResult.OK)
                {
                    return false;
                }

                _bip39SessionPassphrase = pwd.Passphrase;
            }

            return true;
        }

        return RunHdStartupWithVaultOrMnemonic();
    }

    /// <summary>저장된 walletvault.json이 있으면 패스워드만으로 열고, 없으면 니모닉 흐름으로 진입합니다.</summary>
    private bool RunHdStartupWithVaultOrMnemonic()
    {
        if (!File.Exists(_walletVaultFilePath))
        {
            return RunMnemonicStartupUntilDone();
        }

        while (true)
        {
            using (var pw = new StartupPasswordUnlockDialog())
            {
                var dr = pw.ShowDialog(this);
                if (dr == DialogResult.Cancel)
                {
                    return false;
                }

                if (dr == DialogResult.Yes)
                {
                    if (!RunMnemonicStartupUntilDone())
                    {
                        continue;
                    }

                    return true;
                }

                if (!WalletVaultStore.TryDecrypt(_walletVaultFilePath, pw.Password, out var phrase))
                {
                    MessageBox.Show(
                        "패스워드가 올바르지 않거나 저장 파일이 손상되었습니다.",
                        "알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    continue;
                }

                if (!TryFinalizeHdStartup(phrase, pw.Password, suppressAddressMismatchMessage: true))
                {
                    MessageBox.Show(
                        "저장된 암호화 지갑이 주소 목록과 맞지 않습니다. 「니모닉으로 복구」를 시도해 주세요.",
                        "알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning);
                    continue;
                }

                return true;
            }
        }
    }

    private bool RunMnemonicStartupUntilDone()
    {
        while (true)
        {
            using (var dlg = new StartupUnlockDialog())
            {
                var dr = dlg.ShowDialog(this);
                if (dr == DialogResult.Cancel)
                {
                    return false;
                }

                if (dr == DialogResult.Retry)
                {
                    ClearWalletBookOnDisk();
                    using (var pwd = new PasswordSetupDialog())
                    {
                        if (pwd.ShowDialog(this) != DialogResult.OK)
                        {
                            return false;
                        }

                        _bip39SessionPassphrase = pwd.Passphrase;
                    }

                    if (!ExecuteNewWalletCreationWithMnemonicBackupAsync(
                            requireMnemonicOfflineAck: true,
                            promptPasswordIfUnset: false)
                        .GetAwaiter()
                        .GetResult())
                    {
                        return false;
                    }

                    EnableMainWalletActionsAfterFirstSetup();
                    labelWalletState.Text =
                        "지갑 상태: 목록 초기화 후 새 지갑을 만들었습니다. 추가 지갑은 「새 지갑 생성」을 사용하세요.";
                    return true;
                }

                if (TryFinalizeHdStartup(dlg.CapturedMnemonic, dlg.CapturedPassphrase))
                {
                    return true;
                }
            }
        }
    }

    private bool TryFinalizeHdStartup(
        string mnemonicNormalized,
        string bip39Passphrase,
        bool suppressAddressMismatchMessage = false)
    {
        try
        {
            var wallet = new Wallet(mnemonicNormalized, bip39Passphrase);
            var account = wallet.GetAccount(0);
            var addr = account.Address;
            var inBook = _walletEntries.Any(x =>
                string.Equals(x.Address, addr, StringComparison.OrdinalIgnoreCase));
            if (!inBook)
            {
                if (!suppressAddressMismatchMessage)
                {
                    MessageBox.Show(
                        "입력한 니모닉·패스워드로 나온 주소가 저장된 목록에 없습니다. 패스워드와 니모닉을 다시 확인해 주세요.",
                        "알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                }

                return false;
            }

            _bip39SessionPassphrase = bip39Passphrase;
            lock (_walletLock)
            {
                _privateKey = account.PrivateKey;
                _address = account.Address;
            }

            textBoxAddress.Text = _address;
            SelectWalletInList(_address!);
            labelWalletState.Text = "지갑 상태: 시작 시 검증됨 (개인키 비공개)";
            labelBalance.Text = "자산 상태: 조회 전";

            WalletVaultStore.Save(_walletVaultFilePath, mnemonicNormalized, bip39Passphrase);
            return true;
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Mnemonic 처리 실패: {FormatExceptionChain(ex)}",
                "오류",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return false;
        }
    }

    private void ClearWalletBookOnDisk()
    {
        _walletEntries.Clear();
        listBoxWallets.Items.Clear();
        SaveWalletBook();
        WalletVaultStore.DeleteIfExists(_walletVaultFilePath);
    }

    private void WalletForm_Load(object? sender, EventArgs e)
    {
        NormalizeLegacyRpcDefault();
        SyncNetworkSelectionFromRpcUrl();
    }

    private void InitializeNetworkOptions()
    {
        comboBoxNetwork.Items.Clear();
        foreach (var preset in NetworkPresets)
        {
            comboBoxNetwork.Items.Add(preset);
        }

        SyncNetworkSelectionFromRpcUrl();
    }

    private void NormalizeLegacyRpcDefault()
    {
        var rpc = textBoxRpcUrl.Text.Trim();
        if (rpc.Contains("cloudflare-eth.com", StringComparison.OrdinalIgnoreCase))
        {
            SetRpcUrlWithoutSync(NetworkPresets[0].RpcUrl);
        }
    }

    private void SetRpcUrlWithoutSync(string rpcUrl)
    {
        _suppressNetworkSync = true;
        try
        {
            textBoxRpcUrl.Text = rpcUrl;
        }
        finally
        {
            _suppressNetworkSync = false;
        }
    }

    private void SyncNetworkSelectionFromRpcUrl()
    {
        var rpc = textBoxRpcUrl.Text.Trim();
        var index = Array.FindIndex(NetworkPresets, x => string.Equals(x.RpcUrl, rpc, StringComparison.OrdinalIgnoreCase));
        var selectedIndex = index >= 0 ? index : 0;

        _suppressNetworkSync = true;
        try
        {
            comboBoxNetwork.SelectedIndex = selectedIndex;
        }
        finally
        {
            _suppressNetworkSync = false;
        }
    }

    private void comboBoxNetwork_SelectedIndexChanged(object? sender, EventArgs e)
    {
        if (_suppressNetworkSync)
        {
            return;
        }

        if (comboBoxNetwork.SelectedItem is RpcNetworkPreset preset)
        {
            SetRpcUrlWithoutSync(preset.RpcUrl);
        }
    }

    private void textBoxRpcUrl_TextChanged(object? sender, EventArgs e)
    {
        if (_suppressNetworkSync)
        {
            return;
        }

        SyncNetworkSelectionFromRpcUrl();
    }

    private void EnableMainWalletActionsAfterFirstSetup()
    {
        buttonCreateWallet.Enabled = true;
        buttonUnlockWallet.Enabled = true;
    }

    /// <summary>새 HD 지갑을 만들고 니모닉 백업 대화상자를 띄운 뒤 목록·vault를 갱신합니다.</summary>
    private async Task<bool> ExecuteNewWalletCreationWithMnemonicBackupAsync(
        bool requireMnemonicOfflineAck,
        bool promptPasswordIfUnset)
    {
        if (promptPasswordIfUnset && _bip39SessionPassphrase is null)
        {
            using (var pwd = new PasswordSetupDialog())
            {
                if (pwd.ShowDialog(this) != DialogResult.OK)
                {
                    return false;
                }

                _bip39SessionPassphrase = pwd.Passphrase;
            }
        }

        if (_bip39SessionPassphrase is null)
        {
            return false;
        }

        var mnemonic = new Mnemonic(Wordlist.English, WordCount.Twelve);
        var phrase = string.Join(' ', mnemonic.Words);
        var wallet = new Wallet(phrase, _bip39SessionPassphrase);
        var account = wallet.GetAccount(0);
        lock (_walletLock)
        {
            _privateKey = account.PrivateKey;
            _address = account.Address;
        }

        using (var dlg = new MnemonicBackupDialog(phrase, requireMnemonicOfflineAck))
        {
            if (dlg.ShowDialog(this) != DialogResult.OK)
            {
                lock (_walletLock)
                {
                    _privateKey = null;
                    _address = null;
                }

                textBoxAddress.Clear();
                return false;
            }
        }

        textBoxAddress.Text = _address;
        AddWalletEntryIfNeeded(_address, "생성");
        WalletVaultStore.Save(_walletVaultFilePath, NormalizeMnemonicPhrase(phrase), _bip39SessionPassphrase);
        labelWalletState.Text = "지갑 상태: 생성됨 (개인키 비공개, Mnemonic은 팝업에서만 확인)";
        labelBalance.Text = "자산 상태: 조회 전";
        // Do not await: RunStartupBootstrap / RunMnemonicStartupUntilDone call this method via
        // GetAwaiter().GetResult() on the UI thread; awaiting RPC here would deadlock the message loop.
        _ = QueryBalanceAsync();
        return true;
    }

    private async void buttonCreateWallet_Click(object sender, EventArgs e)
    {
        await ExecuteNewWalletCreationWithMnemonicBackupAsync(
            requireMnemonicOfflineAck: false,
            promptPasswordIfUnset: true);
    }

    private void buttonUnlockWallet_Click(object sender, EventArgs e)
    {
        if (_bip39SessionPassphrase is null)
        {
            using (var pwd = new PasswordSetupDialog())
            {
                if (pwd.ShowDialog(this) != DialogResult.OK)
                {
                    return;
                }

                _bip39SessionPassphrase = pwd.Passphrase;
            }
        }

        using var dlg = new ImportWalletDialog();
        if (dlg.ShowDialog(this) != DialogResult.OK)
        {
            return;
        }

        try
        {
            if (dlg.SelectedKind == WalletImportKind.Mnemonic)
            {
                var phrase = NormalizeMnemonicPhrase(dlg.SecretInput);
                var wordCount = phrase.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length;
                if (wordCount is not (12 or 15 or 18 or 21 or 24))
                {
                    MessageBox.Show(
                        "Mnemonic 단어 수는 12, 15, 18, 21, 24개여야 합니다. 공백·줄바꿈으로 단어를 구분했는지 확인하세요.",
                        "알림",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information);
                    return;
                }

                var wallet = new Wallet(phrase, _bip39SessionPassphrase);
                var account = wallet.GetAccount(0);
                lock (_walletLock)
                {
                    _privateKey = account.PrivateKey;
                    _address = account.Address;
                }
                textBoxAddress.Text = _address;
                AddWalletEntryIfNeeded(_address, "Mnemonic 가져오기");
                WalletVaultStore.Save(_walletVaultFilePath, phrase, _bip39SessionPassphrase);
                labelWalletState.Text = "지갑 상태: Mnemonic으로 불러옴 (개인키 비공개)";
            }
            else
            {
                var hex = NormalizePrivateKeyHex(dlg.SecretInput);
                if (hex.Length != 64 || !IsHexString(hex))
                {
                    MessageBox.Show("Private Key는 64자리 16진수(hex)여야 합니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }

                var ecKey = new EthECKey(hex);
                lock (_walletLock)
                {
                    _privateKey = ecKey.GetPrivateKey();
                    _address = ecKey.GetPublicAddress();
                }
                textBoxAddress.Text = _address;
                AddWalletEntryIfNeeded(_address, "Private Key 가져오기");
                labelWalletState.Text = "지갑 상태: Private Key로 불러옴 (개인키 비공개)";
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"지갑 불러오기 실패: {FormatExceptionChain(ex)}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    /// <summary>공백·줄바꿈을 단일 공백으로 합치고, 영어 단어 목록에 맞게 소문자로 맞춥니다.</summary>
    public static string NormalizeMnemonicPhrase(string raw)
    {
        var parts = raw.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        for (var i = 0; i < parts.Length; i++)
        {
            parts[i] = parts[i].ToLowerInvariant();
        }

        return string.Join(' ', parts);
    }

    private static string NormalizePrivateKeyHex(string raw)
    {
        var s = raw.Trim().Replace(" ", "").Replace("\r", "").Replace("\n", "");
        if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            s = s[2..];
        }

        return s;
    }

    private static bool IsHexString(string s)
    {
        foreach (var c in s)
        {
            if (!Uri.IsHexDigit(c))
            {
                return false;
            }
        }

        return true;
    }

    private static string? NormalizeEthereumAddress(string? address)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return null;
        }

        var a = address.Trim();
        if (!a.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            a = "0x" + a;
        }

        if (a.Length != 42)
        {
            return null;
        }

        return a;
    }

    private static string FormatExceptionChain(Exception ex)
    {
        var parts = new List<string>();
        for (Exception? e = ex; e != null; e = e.InnerException)
        {
            if (string.IsNullOrWhiteSpace(e.Message))
            {
                continue;
            }

            if (parts.Count == 0 || !string.Equals(parts[^1], e.Message, StringComparison.Ordinal))
            {
                parts.Add(e.Message);
            }
        }

        return parts.Count == 0 ? ex.GetType().Name : string.Join(" → ", parts);
    }

    private async void buttonQueryBalance_Click(object sender, EventArgs e)
    {
        await QueryBalanceAsync();
    }

    private async Task QueryBalanceAsync()
    {
        if (listBoxWallets.SelectedItem is WalletEntry selectedWallet)
        {
            lock (_walletLock)
            {
                _address = selectedWallet.Address;
                ClearPrivateKeyIfAddressMismatch_NoLock();
            }

            textBoxAddress.Text = selectedWallet.Address;
        }

        if (string.IsNullOrWhiteSpace(_address))
        {
            MessageBox.Show("먼저 지갑을 생성/가져오거나 목록에서 주소를 선택하세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var rpcUrl = textBoxRpcUrl.Text.Trim();
        if (string.IsNullOrWhiteSpace(rpcUrl))
        {
            MessageBox.Show("RPC URL을 입력하세요.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        var addressForRpc = NormalizeEthereumAddress(_address);
        if (addressForRpc is null)
        {
            MessageBox.Show("주소 형식이 올바르지 않습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        try
        {
            buttonQueryBalance.Enabled = false;
            labelBalance.Text = "자산 상태: 조회 중...";

            var web3 = new Web3(rpcUrl);
            var wei = await web3.Eth.GetBalance.SendRequestAsync(addressForRpc);
            var ether = UnitConversion.Convert.FromWei(wei);
            labelBalance.Text = $"자산 상태: {ether:0.################} ETH";
        }
        catch (Exception ex)
        {
            labelBalance.Text = "자산 상태: 조회 실패";
            var detail = FormatExceptionChain(ex);
            var hint = rpcUrl.Contains("cloudflare-eth.com", StringComparison.OrdinalIgnoreCase)
                ? "\n\n참고: cloudflare-eth.com 공개 RPC는 요청을 거절하는 경우가 많습니다. 기본값처럼 https://sepolia.drpc.org 등 Sepolia 엔드포인트를 사용해 보세요."
                : string.Empty;
            MessageBox.Show($"잔액 조회 실패: {detail}{hint}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            buttonQueryBalance.Enabled = true;
        }
    }

    private void buttonCopyAddress_Click(object sender, EventArgs e)
    {
        if (string.IsNullOrWhiteSpace(textBoxAddress.Text))
        {
            MessageBox.Show("주소가 없습니다.", "알림", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Clipboard.SetText(textBoxAddress.Text);
        MessageBox.Show("주소를 클립보드에 복사했습니다.", "완료", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    private void listBoxWallets_SelectedIndexChanged(object sender, EventArgs e)
    {
        if (listBoxWallets.SelectedItem is not WalletEntry selectedWallet)
        {
            return;
        }

        lock (_walletLock)
        {
            _address = selectedWallet.Address;
            ClearPrivateKeyIfAddressMismatch_NoLock();
        }

        textBoxAddress.Text = selectedWallet.Address;
        labelWalletState.Text = $"지갑 상태: 선택됨 ({selectedWallet.Source})";
        labelBalance.Text = "자산 상태: 조회 전";
    }

    private void AddWalletEntryIfNeeded(string address, string source)
    {
        var existing = _walletEntries.FirstOrDefault(x => string.Equals(x.Address, address, StringComparison.OrdinalIgnoreCase));
        if (existing is not null)
        {
            SelectWalletInList(existing.Address);
            return;
        }

        var entry = new WalletEntry(address, source, DateTimeOffset.UtcNow);
        _walletEntries.Add(entry);
        listBoxWallets.Items.Add(entry);
        SelectWalletInList(entry.Address);
        SaveWalletBook();
    }

    private void SelectWalletInList(string address)
    {
        for (var i = 0; i < listBoxWallets.Items.Count; i++)
        {
            if (listBoxWallets.Items[i] is WalletEntry item &&
                string.Equals(item.Address, address, StringComparison.OrdinalIgnoreCase))
            {
                listBoxWallets.SelectedIndex = i;
                break;
            }
        }
    }

    private void LoadWalletBook()
    {
        if (!File.Exists(_walletBookFilePath))
        {
            return;
        }

        try
        {
            var json = File.ReadAllText(_walletBookFilePath);
            var loaded = JsonSerializer.Deserialize<List<WalletEntry>>(json) ?? [];
            _walletEntries.Clear();
            _walletEntries.AddRange(loaded);

            listBoxWallets.Items.Clear();
            foreach (var entry in _walletEntries)
            {
                listBoxWallets.Items.Add(entry);
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show($"지갑 목록을 읽지 못했습니다: {ex.Message}", "오류", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private void SaveWalletBook()
    {
        var json = JsonSerializer.Serialize(_walletEntries);
        File.WriteAllText(_walletBookFilePath, json);
    }

    private WalletRpcSnapshot ReadWalletRpcSnapshot()
    {
        lock (_walletLock)
        {
            return new WalletRpcSnapshot(textBoxRpcUrl.Text.Trim(), _address, _privateKey);
        }
    }

    /// <summary>목록에서 주소만 바꾼 경우, 메모리의 개인키가 해당 주소와 맞지 않으면 제거합니다.</summary>
    private void ClearPrivateKeyIfAddressMismatch_NoLock()
    {
        if (_privateKey is null || string.IsNullOrWhiteSpace(_address))
        {
            return;
        }

        try
        {
            var hex = NormalizePrivateKeyHex(_privateKey);
            if (hex.Length != 64 || !IsHexString(hex))
            {
                _privateKey = null;
                return;
            }

            var keyAddr = new EthECKey(hex).GetPublicAddress();
            if (!string.Equals(keyAddr, _address, StringComparison.OrdinalIgnoreCase))
            {
                _privateKey = null;
            }
        }
        catch
        {
            _privateKey = null;
        }
    }

    private void buttonJsonRpcToggle_Click(object sender, EventArgs e)
    {
        if (_jsonRpcServer is null)
        {
            var port = (int)numericUpDownRpcPort.Value;
            try
            {
                var server = new LocalJsonRpcServer(this, ReadWalletRpcSnapshot);
                server.Start(port);
                _jsonRpcServer = server;
                buttonJsonRpcToggle.Text = "로컬 JSON-RPC 중지";
                labelJsonRpcStatus.Text = $"수신 중: http://127.0.0.1:{port}/ (POST, JSON-RPC 2.0)";
                numericUpDownRpcPort.Enabled = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"JSON-RPC 서버를 시작할 수 없습니다.\n\n{FormatExceptionChain(ex)}\n\nWindows에서 URL 예약이 필요할 수 있습니다(관리자 CMD):\nnetsh http add urlacl url=http://127.0.0.1:{port}/ user=Everyone",
                    "오류",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }
        else
        {
            _jsonRpcServer.Dispose();
            _jsonRpcServer = null;
            buttonJsonRpcToggle.Text = "로컬 JSON-RPC 시작";
            labelJsonRpcStatus.Text = "중지됨";
            numericUpDownRpcPort.Enabled = true;
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        _jsonRpcServer?.Dispose();
        _jsonRpcServer = null;
        textBoxAddress.Text = string.Empty;
        _bip39SessionPassphrase = null;
        lock (_walletLock)
        {
            _privateKey = null;
            _address = null;
        }

        base.OnFormClosing(e);
    }
}

internal sealed record WalletEntry(string Address, string Source, DateTimeOffset AddedAt)
{
    public override string ToString() => $"{Address} ({Source})";
}

internal sealed record RpcNetworkPreset(string DisplayName, string RpcUrl)
{
    public override string ToString() => DisplayName;
}
