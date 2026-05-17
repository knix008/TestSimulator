#include "DirectXRenderer.h"
#include <iostream>
#include <d3dcompiler.h>

namespace XMan
{

    DirectXRenderer::DirectXRenderer() = default;

    DirectXRenderer::~DirectXRenderer()
    {
        Shutdown();
    }

    bool DirectXRenderer::Initialize(HWND hwnd, int width, int height)
    {
        m_width = width;
        m_height = height;

        if (!CreateDeviceAndSwapChain(hwnd, width, height))
        {
            return false;
        }

        if (!CreateRenderTarget())
        {
            return false;
        }

        // Setup viewport
        D3D11_VIEWPORT viewport{};
        viewport.TopLeftX = 0;
        viewport.TopLeftY = 0;
        viewport.Width = static_cast<float>(width);
        viewport.Height = static_cast<float>(height);
        viewport.MinDepth = 0.0f;
        viewport.MaxDepth = 1.0f;
        m_context->RSSetViewports(1, &viewport);

        std::cout << "DirectX renderer initialized: " << width << "x" << height << std::endl;

        return true;
    }

    void DirectXRenderer::Shutdown()
    {
        ReleaseRenderTarget();

        if (m_context)
        {
            m_context->ClearState();
        }

        m_swapChain.Reset();
        m_context.Reset();
        m_device.Reset();
    }

    void DirectXRenderer::BeginFrame()
    {
        // 렌더 타겟 설정
        m_context->OMSetRenderTargets(1, m_renderTargetView.GetAddressOf(), nullptr);
    }

    void DirectXRenderer::EndFrame()
    {
        // Present frame
        m_swapChain->Present(1, 0);
    }

    void DirectXRenderer::Clear(float r, float g, float b, float a)
    {
        float color[4] = {r, g, b, a};
        m_context->ClearRenderTargetView(m_renderTargetView.Get(), color);
    }

    void DirectXRenderer::DrawRectangle(int x, int y, int width, int height, uint32_t color)
    {
        (void)x;
        (void)y;
        (void)width;
        (void)height;
        (void)color;
        // TODO: Rectangle drawing implementation
        // Requires vertex buffer and shader
    }

    void DirectXRenderer::DrawLine(int x1, int y1, int x2, int y2, uint32_t color)
    {
        (void)x1;
        (void)y1;
        (void)x2;
        (void)y2;
        (void)color;
        // TODO: Line drawing implementation
    }

    void DirectXRenderer::DrawText(int x, int y, const char *text, uint32_t color)
    {
        (void)x;
        (void)y;
        (void)text;
        (void)color;
        // TODO: Text rendering implementation
        // Requires DirectWrite or texture-based font
    }

    void DirectXRenderer::Resize(int width, int height)
    {
        if (!m_device || !m_swapChain)
            return;

        m_width = width;
        m_height = height;

        // Release existing render target
        ReleaseRenderTarget();

        // Resize swap chain
        HRESULT hr = m_swapChain->ResizeBuffers(0, width, height, DXGI_FORMAT_UNKNOWN, 0);
        if (FAILED(hr))
        {
            std::cerr << "Failed to resize swap chain" << std::endl;
            return;
        }

        // 렌더 타겟 재생성
        CreateRenderTarget();

        // Reset viewport
        D3D11_VIEWPORT viewport{};
        viewport.TopLeftX = 0;
        viewport.TopLeftY = 0;
        viewport.Width = static_cast<float>(width);
        viewport.Height = static_cast<float>(height);
        viewport.MinDepth = 0.0f;
        viewport.MaxDepth = 1.0f;
        m_context->RSSetViewports(1, &viewport);
    }

    bool DirectXRenderer::CreateDeviceAndSwapChain(HWND hwnd, int width, int height)
    {
        DXGI_SWAP_CHAIN_DESC swapChainDesc{};
        swapChainDesc.BufferCount = 2;
        swapChainDesc.BufferDesc.Width = width;
        swapChainDesc.BufferDesc.Height = height;
        swapChainDesc.BufferDesc.Format = DXGI_FORMAT_R8G8B8A8_UNORM;
        swapChainDesc.BufferDesc.RefreshRate.Numerator = 60;
        swapChainDesc.BufferDesc.RefreshRate.Denominator = 1;
        swapChainDesc.BufferUsage = DXGI_USAGE_RENDER_TARGET_OUTPUT;
        swapChainDesc.OutputWindow = hwnd;
        swapChainDesc.SampleDesc.Count = 1;
        swapChainDesc.SampleDesc.Quality = 0;
        swapChainDesc.Windowed = TRUE;
        swapChainDesc.SwapEffect = DXGI_SWAP_EFFECT_FLIP_DISCARD;

        D3D_FEATURE_LEVEL featureLevels[] = {
            D3D_FEATURE_LEVEL_11_1,
            D3D_FEATURE_LEVEL_11_0,
            D3D_FEATURE_LEVEL_10_1,
            D3D_FEATURE_LEVEL_10_0,
        };

        D3D_FEATURE_LEVEL featureLevel;
        UINT createDeviceFlags = 0;

#ifdef _DEBUG
        createDeviceFlags |= D3D11_CREATE_DEVICE_DEBUG;
#endif

        HRESULT hr = D3D11CreateDeviceAndSwapChain(
            nullptr,
            D3D_DRIVER_TYPE_HARDWARE,
            nullptr,
            createDeviceFlags,
            featureLevels,
            ARRAYSIZE(featureLevels),
            D3D11_SDK_VERSION,
            &swapChainDesc,
            m_swapChain.GetAddressOf(),
            m_device.GetAddressOf(),
            &featureLevel,
            m_context.GetAddressOf());

        if (FAILED(hr))
        {
            std::cerr << "Failed to create D3D11 device and swap chain" << std::endl;
            return false;
        }

        return true;
    }

    bool DirectXRenderer::CreateRenderTarget()
    {
        // 백 버퍼 가져오기
        ComPtr<ID3D11Texture2D> backBuffer;
        HRESULT hr = m_swapChain->GetBuffer(0, IID_PPV_ARGS(backBuffer.GetAddressOf()));
        if (FAILED(hr))
        {
            std::cerr << "Failed to get back buffer" << std::endl;
            return false;
        }

        // 렌더 타겟 뷰 생성
        hr = m_device->CreateRenderTargetView(backBuffer.Get(), nullptr, m_renderTargetView.GetAddressOf());
        if (FAILED(hr))
        {
            std::cerr << "Failed to create render target view" << std::endl;
            return false;
        }

        return true;
    }

    void DirectXRenderer::ReleaseRenderTarget()
    {
        m_renderTargetView.Reset();
    }

} // namespace XMan
