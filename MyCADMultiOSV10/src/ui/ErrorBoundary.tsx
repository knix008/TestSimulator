import { Component, type ErrorInfo, type ReactNode } from 'react'
import { errorReport } from '../core/report'

/**
 * Last line of defence: a failed render used to leave a blank window, which
 * says nothing to whoever hit it. Now it shows what broke, with the whole
 * report - message, build, platform and stack - ready to copy.
 *
 * It deliberately depends on nothing but React and the report helper, so it
 * still works when the rest of the application is the thing that is broken.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; source?: string; platform?: string },
  { failed: boolean; report: string | null; copied: boolean }
> {
  state = { failed: false, report: null as string | null, copied: false }

  static getDerivedStateFromError() {
    // Stop rendering the broken subtree straight away; componentDidCatch fills
    // in the detail a moment later.
    return { failed: true, copied: false }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({
      report: errorReport(error, {
        source: this.props.source ?? 'render',
        platform: this.props.platform,
        componentStack: info.componentStack ?? undefined
      }),
      copied: false
    })
  }

  private copy = async () => {
    const text = this.state.report ?? ''
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const area = document.createElement('textarea')
      area.value = text
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
    }
    this.setState({ copied: true })
  }

  render() {
    const { failed, report } = this.state
    if (!failed) return this.props.children
    return (
      <div className="crash" data-testid="crash">
        <div className="crash-card">
          <h1>MyCAD</h1>
          <p className="crash-lead">
            문제가 발생해 화면을 그릴 수 없습니다. 아래 내용을 복사해 전달해 주세요.
            <br />
            Something went wrong while drawing this window. Copy the report below.
          </p>
          <pre className="crash-report" data-testid="crash-report">{report ?? ''}</pre>
          <div className="crash-actions">
            <button type="button" data-testid="crash-copy" onClick={this.copy}>
              {this.state.copied ? '복사됨 / Copied' : '복사 / Copy'}
            </button>
            <button type="button" data-testid="crash-reload" onClick={() => window.location.reload()}>
              다시 시작 / Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
