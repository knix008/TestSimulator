using System;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Threading;
using MyClockWinV10.Models;

namespace MyClockWinV10.Services;

public static class OutlookCalendarService
{
    private const int OlFolderCalendar  = 9;
    private const int OlAppointmentItem = 26;

    public static bool IsAvailable()
    {
        try { return Type.GetTypeFromProgID("Outlook.Application") != null; }
        catch { return false; }
    }

    public static List<CalendarEventItem> GetUpcomingEvents(
        int daysAhead = 31,
        Action<string>? onProgress = null,
        CancellationToken ct = default)
    {
        var result = new List<CalendarEventItem>();

        // ── 1. Outlook 설치 확인 ────────────────────────────────────────────
        onProgress?.Invoke("1단계: Outlook 설치 확인 중...");
        ct.ThrowIfCancellationRequested();

        var progType = Type.GetTypeFromProgID("Outlook.Application");
        if (progType == null)
            throw new InvalidOperationException("Outlook이 이 컴퓨터에 설치되어 있지 않습니다.");

        onProgress?.Invoke("  ✓ Outlook 설치 확인됨");

        // ── 2. COM 인스턴스 생성 ────────────────────────────────────────────
        onProgress?.Invoke("2단계: Outlook COM 연결 중...");
        ct.ThrowIfCancellationRequested();

        dynamic? app = null;
        dynamic? ns  = null;

        try
        {
            app = Activator.CreateInstance(progType)
                  ?? throw new InvalidOperationException("Outlook COM 인스턴스를 생성할 수 없습니다.");

            // ── 3. MAPI 네임스페이스 ────────────────────────────────────────
            onProgress?.Invoke("3단계: MAPI 네임스페이스 초기화 중...");
            ct.ThrowIfCancellationRequested();

            ns = app.GetNamespace("MAPI");
            onProgress?.Invoke("  ✓ MAPI 초기화 완료");

            // ── 4. 스토어(계정) 목록 ────────────────────────────────────────
            onProgress?.Invoke("4단계: 계정 목록 확인 중...");
            ct.ThrowIfCancellationRequested();

            int storeCount = (int)ns.Stores.Count;
            if (storeCount == 0)
                throw new InvalidOperationException("연결된 Outlook 계정이 없습니다.");

            onProgress?.Invoke($"  ✓ {storeCount}개 계정 발견");

            var rangeStart = DateTime.Today;
            var rangeEnd   = DateTime.Now.AddDays(daysAhead);

            // ── 5. 각 계정 캘린더 수집 ──────────────────────────────────────
            for (int s = 1; s <= storeCount; s++)
            {
                ct.ThrowIfCancellationRequested();

                dynamic? store = null;
                string storeName = $"계정 {s}";
                try
                {
                    store = ns.Stores[s];
                    try { storeName = (string)store.DisplayName; } catch { }

                    onProgress?.Invoke($"5단계: [{storeName}] 캘린더 수집 중... ({s}/{storeCount})");

                    int before = result.Count;
                    CollectFromStore(store, storeName, rangeStart, rangeEnd,
                                     result, onProgress, ct);
                    store = null; // CollectFromStore 내부에서 해제됨

                    int added = result.Count - before;
                    onProgress?.Invoke($"  ✓ [{storeName}] {added}개 추가됨");
                }
                catch (OperationCanceledException) { throw; }
                catch (Exception ex)
                {
                    onProgress?.Invoke($"  ✗ [{storeName}] 실패: {ex.Message}");
                }
                finally
                {
                    if (store != null) Marshal.ReleaseComObject(store);
                }
            }

            onProgress?.Invoke($"완료: 총 {result.Count}개 일정 수집됨");
        }
        finally
        {
            if (ns  != null) Marshal.ReleaseComObject(ns);
            if (app != null) Marshal.ReleaseComObject(app);
        }

        result.Sort((a, b) => a.Start.CompareTo(b.Start));
        return result;
    }

    private static void CollectFromStore(
        dynamic store, string storeName,
        DateTime rangeStart, DateTime rangeEnd,
        List<CalendarEventItem> result,
        Action<string>? onProgress,
        CancellationToken ct)
    {
        dynamic? calFolder = null;
        dynamic? items     = null;

        try
        {
            // 캘린더 폴더 가져오기
            try
            {
                calFolder = store.GetDefaultFolder(OlFolderCalendar);
            }
            catch (Exception ex)
            {
                onProgress?.Invoke($"  ↳ [{storeName}] 캘린더 폴더 없음: {ex.Message}");
                return;
            }

            items = calFolder.Items;
            int totalItems = 0;
            try { totalItems = (int)items.Count; } catch { }
            onProgress?.Invoke($"  ↳ [{storeName}] 전체 항목 수: {totalItems}개, 정렬·필터 적용 중...");

            items.IncludeRecurrences = true;
            items.Sort("[Start]");

            // 1차 시도: Restrict 필터 (빠름)
            string startStr = rangeStart.ToString("MM/dd/yyyy HH:mm", CultureInfo.InvariantCulture);
            string endStr   = rangeEnd  .ToString("MM/dd/yyyy HH:mm", CultureInfo.InvariantCulture);
            string filter   = $"[Start] >= '{startStr}' AND [Start] <= '{endStr}'";

            int collected = IterateItems(items, filter, rangeStart, rangeEnd, result, ct);

            // 2차 시도: Restrict가 0건이면 전체 직접 탐색으로 폴백
            if (collected == 0 && totalItems > 0)
            {
                onProgress?.Invoke($"  ↳ [{storeName}] 필터 결과 없음 → 전체 직접 탐색 중...");
                collected = IterateItemsDirect(items, rangeStart, rangeEnd, result, ct);
                onProgress?.Invoke($"  ↳ [{storeName}] 직접 탐색 결과: {collected}개");
            }
        }
        finally
        {
            if (items     != null) Marshal.ReleaseComObject(items);
            if (calFolder != null) Marshal.ReleaseComObject(calFolder);
            Marshal.ReleaseComObject(store);
        }
    }

    // Restrict 필터를 사용한 빠른 탐색
    private static int IterateItems(
        dynamic items, string filter,
        DateTime rangeStart, DateTime rangeEnd,
        List<CalendarEventItem> result, CancellationToken ct)
    {
        dynamic? filtered = null;
        int count = 0;
        try
        {
            filtered = items.Restrict(filter);
            dynamic? item = filtered.GetFirst();
            while (item != null)
            {
                ct.ThrowIfCancellationRequested();
                dynamic? next = null;
                try
                {
                    if ((int)item.Class == OlAppointmentItem)
                    {
                        AddItem(item, result);
                        count++;
                    }
                    next = filtered.GetNext();
                }
                catch { next = filtered.GetNext(); }
                finally { Marshal.ReleaseComObject(item); }
                item = next;
            }
        }
        catch (OperationCanceledException) { throw; }
        catch { /* 필터 실패 시 0 반환 → 직접 탐색으로 폴백 */ }
        finally
        {
            if (filtered != null) Marshal.ReleaseComObject(filtered);
        }
        return count;
    }

    // Restrict 없이 전체 항목을 순회하며 날짜 직접 비교 (폴백)
    private static int IterateItemsDirect(
        dynamic items,
        DateTime rangeStart, DateTime rangeEnd,
        List<CalendarEventItem> result, CancellationToken ct)
    {
        int count = 0;
        dynamic? item = items.GetFirst();
        while (item != null)
        {
            ct.ThrowIfCancellationRequested();
            dynamic? next = null;
            try
            {
                if ((int)item.Class == OlAppointmentItem)
                {
                    DateTime start = (DateTime)item.Start;
                    if (start > rangeEnd)
                    {
                        Marshal.ReleaseComObject(item);
                        item = null;
                        break;
                    }
                    if (start >= rangeStart)
                    {
                        AddItem(item, result);
                        count++;
                    }
                }
                next = items.GetNext();
            }
            catch { next = items.GetNext(); }
            finally { if (item != null) Marshal.ReleaseComObject(item); }
            item = next;
        }
        return count;
    }

    private static void AddItem(dynamic item, List<CalendarEventItem> result)
    {
        string subject  = (string?)item.Subject  ?? "";
        string location = (string?)item.Location ?? "";
        result.Add(new CalendarEventItem
        {
            Title    = string.IsNullOrEmpty(subject) ? "(제목 없음)" : subject,
            Start    = (DateTime)item.Start,
            End      = (DateTime)item.End,
            Location = location,
            IsAllDay = (bool)item.AllDayEvent
        });
    }
}
