using System;
using System.Collections.Generic;
using System.IO;
using System.Windows;
using STTWinV10.Services;
using Whisper.net.Ggml;

namespace STTWinV10
{
    public partial class MainWindow : Window
    {
        private RealtimeSTTService? _sttService;
        private WhisperSTTService? _whisperService;
        private string _appDataPath;
        private string _currentModelPath;

        public MainWindow()
        {
            InitializeComponent();
            
            // 아이콘 설정
            try
            {
                var iconUri = new Uri("pack://application:,,,/daemon_hammer.ico");
                this.Icon = System.Windows.Media.Imaging.BitmapFrame.Create(iconUri);
            }
            catch
            {
                // 아이콘 로드 실패 시 무시
            }
            
            // 앱 데이터 폴더 설정
            _appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "STTWinV10"
            );
            Directory.CreateDirectory(_appDataPath);
            _currentModelPath = Path.Combine(_appDataPath, "ggml-base.bin");

            Loaded += MainWindow_Loaded;
            Closing += MainWindow_Closing;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                UpdateStatus("초기화 중...");

                // 마이크 목록 로드
                LoadMicrophones();
                
                // 모델 목록 로드
                LoadModels();

                // Whisper 서비스 생성
                _whisperService = new WhisperSTTService(_currentModelPath);
                
                // 실시간 STT 서비스 생성 (3초마다 처리)
                _sttService = new RealtimeSTTService(_whisperService, processingIntervalSeconds: 3.0);

                // 이벤트 연결
                _sttService.TranscriptionReceived += OnTranscriptionReceived;
                _sttService.StatusChanged += OnStatusChanged;
                _sttService.ErrorOccurred += OnErrorOccurred;
                _sttService.AudioLevelChanged += OnAudioLevelChanged;

                UpdateStatus("준비 완료");
            }
            catch (Exception ex)
            {
                MessageBox.Show($"초기화 실패: {ex.Message}", "오류", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                UpdateStatus($"초기화 실패: {ex.Message}");
            }
        }

        private void LoadMicrophones()
        {
            try
            {
                var devices = AudioCaptureService.GetAvailableDevices();
                MicrophoneComboBox.ItemsSource = devices;
                
                if (devices.Count > 0)
                {
                    MicrophoneComboBox.SelectedIndex = 0;
                    UpdateStatus($"{devices.Count}개의 마이크를 찾았습니다.");
                }
                else
                {
                    UpdateStatus("마이크를 찾을 수 없습니다.");
                    MessageBox.Show("사용 가능한 마이크를 찾을 수 없습니다.", "경고",
                        MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            }
            catch (Exception ex)
            {
                UpdateStatus($"마이크 로드 실패: {ex.Message}");
            }
        }

        private void MicrophoneComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (MicrophoneComboBox.SelectedItem is AudioDevice device && _sttService != null)
            {
                _sttService.SetMicrophoneDevice(device.DeviceNumber);
                UpdateStatus($"마이크 선택: {device.DeviceName}");
            }
        }

        private void LoadModels()
        {
            try
            {
                var models = new List<WhisperModel>
                {
                    new WhisperModel { Name = "Tiny (75MB) - 빠른 속도", Type = GgmlType.Tiny, FileName = "ggml-tiny.bin" },
                    new WhisperModel { Name = "Base (142MB) - 균형 (권장)", Type = GgmlType.Base, FileName = "ggml-base.bin" },
                    new WhisperModel { Name = "Small (466MB) - 높은 정확도", Type = GgmlType.Small, FileName = "ggml-small.bin" },
                    new WhisperModel { Name = "Large-v3 (2.9GB) - 최고 정확도", Type = GgmlType.LargeV3, FileName = "ggml-large-v3.bin" }
                };

                ModelComboBox.ItemsSource = models;
                ModelComboBox.DisplayMemberPath = "Name";
                
                // Base 모델을 기본 선택
                ModelComboBox.SelectedIndex = 1;
            }
            catch (Exception ex)
            {
                UpdateStatus($"모델 로드 실패: {ex.Message}");
            }
        }

        private async void ModelComboBox_SelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
        {
            if (ModelComboBox.SelectedItem is WhisperModel model)
            {
                try
                {
                    // 실행 중이면 중지
                    if (_sttService?.IsRunning == true)
                    {
                        MessageBox.Show("인식을 중지한 후 모델을 변경해주세요.", "알림",
                            MessageBoxButton.OK, MessageBoxImage.Information);
                        // 이전 선택으로 복원
                        e.Handled = true;
                        return;
                    }

                    UpdateStatus($"모델 변경 중: {model.Name}...");
                    
                    // 새 모델 경로 설정
                    _currentModelPath = Path.Combine(_appDataPath, model.FileName);

                    // 기존 서비스 정리
                    if (_sttService != null)
                    {
                        _sttService.TranscriptionReceived -= OnTranscriptionReceived;
                        _sttService.StatusChanged -= OnStatusChanged;
                        _sttService.ErrorOccurred -= OnErrorOccurred;
                        _sttService.AudioLevelChanged -= OnAudioLevelChanged;
                        _sttService.Dispose();
                    }

                    // 새 Whisper 서비스 생성
                    _whisperService = new WhisperSTTService(_currentModelPath);
                    
                    // 모델이 없으면 다운로드
                    if (!File.Exists(_currentModelPath))
                    {
                        UpdateStatus($"모델 다운로드 중... (파일 크기: {model.Name.Split('(')[1].Split(')')[0]})");
                        await _whisperService.InitializeAsync();
                    }
                    else
                    {
                        await _whisperService.InitializeAsync();
                    }

                    // 새 실시간 STT 서비스 생성
                    _sttService = new RealtimeSTTService(_whisperService, processingIntervalSeconds: 3.0);

                    // 이벤트 재연결
                    _sttService.TranscriptionReceived += OnTranscriptionReceived;
                    _sttService.StatusChanged += OnStatusChanged;
                    _sttService.ErrorOccurred += OnErrorOccurred;
                    _sttService.AudioLevelChanged += OnAudioLevelChanged;

                    // 마이크 설정 복원
                    if (MicrophoneComboBox.SelectedItem is AudioDevice device)
                    {
                        _sttService.SetMicrophoneDevice(device.DeviceNumber);
                    }

                    // 볼륨 설정 복원
                    UpdateMicrophoneVolume();

                    UpdateStatus($"모델 변경 완료: {model.Name}");
                }
                catch (Exception ex)
                {
                    UpdateStatus($"모델 변경 실패: {ex.Message}");
                    MessageBox.Show($"모델 변경 실패:\n{ex.Message}", "오류",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        private void RefreshMicButton_Click(object sender, RoutedEventArgs e)
        {
            LoadMicrophones();
        }

        private void VolumeSlider_ValueChanged(object sender, System.Windows.RoutedPropertyChangedEventArgs<double> e)
        {
            UpdateMicrophoneVolume();
        }

        private void UpdateMicrophoneVolume()
        {
            if (_sttService == null || VolumeValueText == null)
                return;

            // 슬라이더 값을 0.0 ~ 2.0 범위로 변환 (슬라이더는 0~200)
            float volume = (float)(VolumeSlider.Value / 100.0);
            _sttService.SetMicrophoneVolume(volume);

            // 텍스트 업데이트
            VolumeValueText.Text = $"{(int)VolumeSlider.Value}%";
        }

        private async void StartButton_Click(object sender, RoutedEventArgs e)
        {
            if (_sttService == null)
                return;

            try
            {
                StartButton.IsEnabled = false;
                UpdateStatus("시작 중...");

                await _sttService.StartAsync();

                StartButton.IsEnabled = false;
                StopButton.IsEnabled = true;
                ProcessButton.IsEnabled = true;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"시작 실패: {ex.Message}", "오류", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
                StartButton.IsEnabled = true;
                StopButton.IsEnabled = false;
                ProcessButton.IsEnabled = false;
            }
        }

        private void StopButton_Click(object sender, RoutedEventArgs e)
        {
            if (_sttService == null)
                return;

            try
            {
                _sttService.Stop();

                StartButton.IsEnabled = true;
                StopButton.IsEnabled = false;
                ProcessButton.IsEnabled = false;
            }
            catch (Exception ex)
            {
                MessageBox.Show($"중지 실패: {ex.Message}", "오류", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private async void ProcessButton_Click(object sender, RoutedEventArgs e)
        {
            if (_sttService == null)
                return;

            try
            {
                await _sttService.ProcessCurrentBufferAsync();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"처리 실패: {ex.Message}", "오류", 
                    MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void ClearButton_Click(object sender, RoutedEventArgs e)
        {
            TranscriptionTextBox.Clear();
            UpdateStatus("텍스트 지워짐");
        }

        private void OnTranscriptionReceived(object? sender, string text)
        {
            Dispatcher.Invoke(() =>
            {
                if (!string.IsNullOrWhiteSpace(text))
                {
                    // 기존 텍스트에 추가
                    if (!string.IsNullOrEmpty(TranscriptionTextBox.Text))
                    {
                        TranscriptionTextBox.AppendText(" ");
                    }
                    TranscriptionTextBox.AppendText(text.Trim());
                    
                    // 자동 스크롤
                    TranscriptionTextBox.ScrollToEnd();
                }
            });
        }

        private void OnStatusChanged(object? sender, string status)
        {
            Dispatcher.Invoke(() => UpdateStatus(status));
        }

        private void OnErrorOccurred(object? sender, string error)
        {
            Dispatcher.Invoke(() =>
            {
                UpdateStatus($"오류: {error}");
                
                // 중요한 오류는 메시지 박스로 표시
                if (error.Contains("실패") || error.Contains("오류"))
                {
                    MessageBox.Show(error, "오류", MessageBoxButton.OK, MessageBoxImage.Warning);
                }
            });
        }

        private void OnAudioLevelChanged(object? sender, float level)
        {
            Dispatcher.Invoke(() =>
            {
                // 0-1 범위를 0-100으로 변환
                AudioLevelBar.Value = level * 100;
            });
        }

        private void UpdateStatus(string status)
        {
            StatusTextBlock.Text = $"{DateTime.Now:HH:mm:ss} - {status}";
        }

        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            _sttService?.Dispose();
        }
    }

    public class WhisperModel
    {
        public string Name { get; set; } = string.Empty;
        public GgmlType Type { get; set; }
        public string FileName { get; set; } = string.Empty;
    }
}
