namespace MemoPadV10;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        EditorSettings.Data? settings = EditorSettings.TryLoad();
        if (settings != null)
        {
            Loc.Language = Loc.Parse(settings.Language);
        }

        if (args.Any(a => string.Equals(a, AppIpc.ListArg, StringComparison.OrdinalIgnoreCase)))
        {
            RunListApp();
            return;
        }

        string? openFile = ParseOpenFile(args);
        int openIndex = openFile is null ? ParseOpenIndex(args) : -1;
        bool openNew = args.Any(a => string.Equals(a, "--new", StringComparison.OrdinalIgnoreCase));
        RunPadApp(openIndex, openFile, openNew);
    }

    private static string? ParseOpenFile(string[] args)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], "--open-file", StringComparison.OrdinalIgnoreCase))
            {
                string path = args[i + 1].Trim().Trim('"');
                if (!string.IsNullOrWhiteSpace(path))
                {
                    return path;
                }
            }
        }

        return null;
    }

    private static int ParseOpenIndex(string[] args)
    {
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (string.Equals(args[i], "--open-index", StringComparison.OrdinalIgnoreCase)
                && int.TryParse(args[i + 1], out int idx)
                && idx >= 0)
            {
                return idx;
            }
        }

        return -1;
    }

    private static void RunListApp()
    {
        using Mutex? mutex = AppIpc.TryAcquireListMutex(out bool createdNew);
        if (!createdNew || mutex is null)
        {
            AppIpc.SignalShowList();
            return;
        }

        using EventWaitHandle showEvent = AppIpc.CreateShowListEvent();
        using EventWaitHandle exitEvent = AppIpc.CreateExitListEvent();
        using EventWaitHandle memosChangedEvent = AppIpc.CreateMemosChangedEvent();
        using EventWaitHandle settingsChangedEvent = AppIpc.CreateSettingsChangedListEvent();
        using EventWaitHandle bringListFrontEvent = AppIpc.CreateBringListFrontEvent();
        using EventWaitHandle previewThemeEvent = AppIpc.CreatePreviewThemeListEvent();

        MemoListForm listForm = new();
        ApplicationContext context = new(listForm);

        Thread watcher = new(() =>
        {
            WaitHandle[] handles =
            [
                showEvent,
                exitEvent,
                memosChangedEvent,
                settingsChangedEvent,
                bringListFrontEvent,
                previewThemeEvent
            ];
            while (true)
            {
                int signaled = WaitHandle.WaitAny(handles);
                if (signaled == 1)
                {
                    try
                    {
                        if (!listForm.IsDisposed)
                        {
                            listForm.BeginInvoke(new Action(() => listForm.Close()));
                        }
                    }
                    catch (ObjectDisposedException)
                    {
                    }

                    break;
                }

                try
                {
                    if (!listForm.IsDisposed)
                    {
                        if (signaled == 2)
                        {
                            listForm.BeginInvoke(new Action(listForm.ReloadAndRefresh));
                        }
                        else if (signaled == 3)
                        {
                            listForm.BeginInvoke(new Action(listForm.ApplySettingsFromStore));
                        }
                        else if (signaled == 4)
                        {
                            // 메모 창 선택 → 목록만 올린 뒤(포커스 훔치지 않음). 메모 창이 위에 유지.
                            listForm.BeginInvoke(new Action(() =>
                            {
                                AppIpc.SuppressActivateHandling();
                                AppIpc.ActivateWindow(listForm, setForeground: false, restoreIfHidden: false);
                            }));
                        }
                        else if (signaled == 5)
                        {
                            // 설정창의 실시간 색 미리보기 → 목록 전체에 즉시 반영(저장 없음).
                            if (AppIpc.TryReadPreviewColor(out Color previewColor))
                            {
                                listForm.BeginInvoke(new Action(() => listForm.ApplyPreviewBackColor(previewColor)));
                            }
                        }
                        else
                        {
                            listForm.BeginInvoke(new Action(() =>
                            {
                                listForm.ReloadAndRefresh();
                                AppIpc.ActivateWindow(listForm);
                            }));
                        }
                    }
                }
                catch (ObjectDisposedException)
                {
                }
            }
        })
        {
            IsBackground = true,
            Name = "MemoListIpcWatcher"
        };
        watcher.Start();

        Application.Run(context);
    }

    private static void RunPadApp(int openIndex, string? openFile, bool openNew)
    {
        using Mutex? mutex = AppIpc.TryAcquirePadMutex(out bool createdNew);
        if (!createdNew || mutex is null)
        {
            // 이미 패드가 실행 중이면 열기 요청을 전달하거나 목록을 띄웁니다.
            if (openNew)
            {
                AppIpc.RequestNewMemo();
            }
            else if (!string.IsNullOrWhiteSpace(openFile))
            {
                AppIpc.RequestOpenTextFile(openFile);
            }
            else if (openIndex >= 0)
            {
                AppIpc.RequestOpenMemo(openIndex);
            }
            else
            {
                AppIpc.LaunchOrShowList();
            }

            return;
        }

        ApplicationContext appContext = new();
        MemoPadForm firstPad = new();
        appContext.MainForm = firstPad;

        Application.Idle += (_, _) =>
        {
            if (Application.OpenForms.Count == 0)
            {
                appContext.ExitThread();
            }
        };

        firstPad.Show();

        // 시작 인자가 없으면 이전 실행의 pending 잔여물이 첫 열기를 가로채지 않게 정리
        if (!openNew && openIndex < 0 && string.IsNullOrWhiteSpace(openFile))
        {
            try
            {
                if (File.Exists(AppIpc.PendingNewMemoPath))
                {
                    File.Delete(AppIpc.PendingNewMemoPath);
                }

                if (File.Exists(AppIpc.PendingOpenPath))
                {
                    File.Delete(AppIpc.PendingOpenPath);
                }

                if (File.Exists(AppIpc.PendingOpenFilePath))
                {
                    File.Delete(AppIpc.PendingOpenFilePath);
                }
            }
            catch
            {
                // ignore
            }
        }

        MemoPadForm.StartOpenMemoWatcher();
        MemoPadForm.StartSettingsWatcher();
        MemoPadForm.StartThemePreviewWatcher();
        MemoPadForm.StartCompanionForegroundWatcher();

        if (openNew || AppIpc.TryConsumePendingNewMemo())
        {
            firstPad.BeginInvoke(new Action(MemoPadForm.OpenBlankNewMemo));
            Application.Run(appContext);
            return;
        }

        if (string.IsNullOrWhiteSpace(openFile))
        {
            AppIpc.TryReadPendingOpenFilePath(out openFile!);
        }

        if (!string.IsNullOrWhiteSpace(openFile))
        {
            string path = openFile;
            firstPad.BeginInvoke(new Action(() => firstPad.OpenExternalTextFile(path)));
            Application.Run(appContext);
            return;
        }

        if (openIndex < 0)
        {
            AppIpc.TryReadPendingOpenIndex(out openIndex);
        }

        if (openIndex >= 0)
        {
            firstPad.BeginInvoke(new Action(() => firstPad.OpenMemoByIndex(openIndex)));
        }

        Application.Run(appContext);
    }
}
