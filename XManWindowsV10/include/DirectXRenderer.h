#pragma once

#include <Windows.h>
#include <d3d11.h>
#include <dxgi.h>
#include <wrl/client.h>
#include <memory>

namespace XMan
{

    using Microsoft::WRL::ComPtr;

    class DirectXRenderer
    {
    public:
        DirectXRenderer();
        ~DirectXRenderer();

        // 초기화
        bool Initialize(HWND hwnd, int width, int height);
        void Shutdown();

        // 렌더링
        void BeginFrame();
        void EndFrame();
        void Clear(float r, float g, float b, float a);

        // 그리기 함수들
        void DrawRectangle(int x, int y, int width, int height, uint32_t color);
        void DrawLine(int x1, int y1, int x2, int y2, uint32_t color);
        void DrawText(int x, int y, const char *text, uint32_t color);

        // 윈도우 크기 변경
        void Resize(int width, int height);

        ID3D11Device *GetDevice() { return m_device.Get(); }
        ID3D11DeviceContext *GetContext() { return m_context.Get(); }

    private:
        bool CreateDeviceAndSwapChain(HWND hwnd, int width, int height);
        bool CreateRenderTarget();
        void ReleaseRenderTarget();

        ComPtr<ID3D11Device> m_device;
        ComPtr<ID3D11DeviceContext> m_context;
        ComPtr<IDXGISwapChain> m_swapChain;
        ComPtr<ID3D11RenderTargetView> m_renderTargetView;

        int m_width = 0;
        int m_height = 0;
    };

} // namespace XMan
