using System;
using System.IO;
using System.Windows;
using STTWinV10.Services;

namespace STTWinV10
{
    public partial class MainWindow : Window
    {
        private RealtimeSTTService? _sttService;
        private readonly string _modelPath;

        public MainWindow()
        {
            InitializeComponent();
            
            // 모델 경로 설정 (앱 데이터 폴더에 저장)
            var appDataPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "STTWinV10"
            );
            Directory.CreateDirectory(appDataPath);
            _modelPath = Path.Combine(appDataPath, "ggml-base.bin");

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

                // Whisper 서비스 생성
                var whisperService = new WhisperSTTService(_modelPath);
                
                // 실시간 STT 서비스 생성 (3초마다 처리)
                _sttService = new RealtimeSTTService(whisperService, processingIntervalSeconds: 3.0);

                // 이벤트 연결
                _sttService.TranscriptionReceived += OnTranscriptionReceived;
                _sttService.StatusChanged += OnStatusChanged;
                _sttService.ErrorOccurred += OnErrorOccurred;

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

        private void RefreshMicButton_Click(object sender, RoutedEventArgs e)
        {
            LoadMicrophones();
        }

        private void VolumeSlider_ValueChanged(object sender, System.Windows.Controls.Primitives.DragCompletedEventArgs e)
        {
            UpdateMicrophoneVolume();
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

        private void UpdateStatus(string status)
        {
            StatusTextBlock.Text = $"{DateTime.Now:HH:mm:ss} - {status}";
        }

        private void MainWindow_Closing(object? sender, System.ComponentModel.CancelEventArgs e)
        {
            _sttService?.Dispose();
        }
    }
}
