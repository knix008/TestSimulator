import { useCallback, useState } from 'react'
import { formatEther, formatGwei } from 'viem'
import { runSearch, type SearchMode, type SearchResult } from './lib/search'
import { sepoliaRpcUrl } from './lib/client'
import './App.css'

const EXPLORER = 'https://sepolia.etherscan.io'

const modeOptions: { value: SearchMode; label: string; hint: string }[] = [
  { value: 'auto', label: '자동', hint: '입력 형식에 따라 판별' },
  { value: 'address', label: '주소', hint: '0x + 40자리 16진' },
  { value: 'tx', label: '트랜잭션', hint: '트랜잭션 해시' },
  { value: 'block', label: '블록', hint: '번호, 16진, latest 등' },
  { value: 'blockHash', label: '블록 해시', hint: '32바이트 블록 해시' },
]

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      <div className="field-value">{children}</div>
    </div>
  )
}

function Mono({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return <span className={`mono ${className}`.trim()}>{children}</span>
}

function ExternalLink({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <a className="ext" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function ResultView({ result }: { result: SearchResult }) {
  if (result.type === 'error') {
    return (
      <div className="panel panel-error" role="alert">
        {result.message}
      </div>
    )
  }
  if (result.type === 'not_found') {
    return (
      <div className="panel panel-warn" role="status">
        {result.message}
      </div>
    )
  }

  if (result.type === 'address') {
    const url = `${EXPLORER}/address/${result.address}`
    return (
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">주소</h2>
        </div>
        <Field label="주소">
          <Mono>{result.address}</Mono>{' '}
          <ExternalLink href={url}>Etherscan</ExternalLink>
        </Field>
        <Field label="잔액 (ETH)">
          <Mono>{formatEther(result.balanceWei)}</Mono>
        </Field>
        <Field label="nonce (전송 횟수)">{result.nonce}</Field>
        <Field label="컨트랙트">
          {result.isContract ? '예 (바이트코드 존재)' : '아니오 (EOA)'}
        </Field>
        {result.bytecode && (
          <Field label="바이트코드 길이 (바이트)">
            {(result.bytecode.length - 2) / 2}
          </Field>
        )}
        <p className="footnote">
          체인상 전체 트랜잭션 목록은 인덱서(예: Etherscan API)가 필요합니다. 위 링크에서
          상세 내역을 확인할 수 있습니다.
        </p>
      </div>
    )
  }

  if (result.type === 'transaction') {
    const { tx, receipt } = result
    const hash = tx.hash
    const url = `${EXPLORER}/tx/${hash}`
    return (
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">트랜잭션</h2>
        </div>
        <Field label="해시">
          <Mono>{hash}</Mono> <ExternalLink href={url}>Etherscan</ExternalLink>
        </Field>
        {tx.blockNumber != null && (
          <Field label="블록">
            <Mono>{tx.blockNumber.toString()}</Mono>{' '}
            <ExternalLink href={`${EXPLORER}/block/${tx.blockNumber}`}>
              보기
            </ExternalLink>
          </Field>
        )}
        <Field label="보낸 주소">
          <Mono>{tx.from}</Mono>
        </Field>
        <Field label="받는 주소">
          <Mono>{tx.to ?? '(컨트랙트 생성)'}</Mono>
        </Field>
        <Field label="값 (ETH)">
          <Mono>{formatEther(tx.value)}</Mono>
        </Field>
        <Field label="가스 한도">{tx.gas?.toString() ?? '—'}</Field>
        {tx.gasPrice != null && (
          <Field label="가스 가격">
            <Mono>{formatGwei(tx.gasPrice)} gwei</Mono>
          </Field>
        )}
        {receipt && (
          <>
            <Field label="상태">
              {receipt.status === 'success' ? '성공' : '실패'}
            </Field>
            <Field label="누적 가스 사용">{receipt.gasUsed.toString()}</Field>
            {receipt.effectiveGasPrice != null && (
              <Field label="실효 가스 가격">
                <Mono>{formatGwei(receipt.effectiveGasPrice)} gwei</Mono>
              </Field>
            )}
          </>
        )}
        <Field label="입력 데이터 (앞부분)">
          <Mono className="break-all">
            {tx.input.length > 130 ? `${tx.input.slice(0, 130)}…` : tx.input}
          </Mono>
        </Field>
      </div>
    )
  }

  if (result.type === 'block') {
    const b = result.block
    const url = `${EXPLORER}/block/${b.number ?? b.hash}`
    return (
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">블록</h2>
        </div>
        <Field label="번호">{b.number?.toString() ?? '—'}</Field>
        <Field label="해시">
          <Mono>{b.hash ?? '—'}</Mono>{' '}
          {b.hash && <ExternalLink href={url}>Etherscan</ExternalLink>}
        </Field>
        <Field label="타임스탬프">
          {new Date(Number(b.timestamp) * 1000).toISOString()}
        </Field>
        <Field label="트랜잭션 수">{b.transactions.length}</Field>
        <Field label="가스 사용 / 한도">
          {b.gasUsed?.toString() ?? '—'} / {b.gasLimit.toString()}
        </Field>
        {b.baseFeePerGas != null && (
          <Field label="기본 수수료 (base fee)">
            <Mono>{formatGwei(b.baseFeePerGas)} gwei</Mono>
          </Field>
        )}
        <Field label="수수료 수령 (fee recipient)">
          <Mono>{b.miner}</Mono>
        </Field>
        {b.parentHash && (
          <Field label="부모 해시">
            <Mono className="break-all">{b.parentHash}</Mono>
          </Field>
        )}
      </div>
    )
  }

  return null
}

export default function App() {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<SearchMode>('auto')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SearchResult | null>(null)

  const onSearch = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const r = await runSearch(query, mode)
      setResult(r)
    } finally {
      setLoading(false)
    }
  }, [query, mode])

  const currentHint = modeOptions.find((o) => o.value === mode)?.hint ?? ''

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <span className="brand-badge">Live · Sepolia</span>
        </div>
        <h1 className="title">
          Sepolia <span className="title-accent">스캐너</span>
        </h1>
        <p className="subtitle">
          테스트넷 RPC에 연결해 주소·트랜잭션·블록을 빠르게 조회합니다.
        </p>
      </header>

      <section className="rpc-bar" aria-label="RPC 엔드포인트">
        <span className="rpc-label">RPC</span>
        <Mono className="rpc-url">{sepoliaRpcUrl}</Mono>
      </section>

      <section className="search-card" aria-label="검색">
        <div className="search-card-inner">
          <div className="mode-row" role="radiogroup" aria-label="검색 방식">
            {modeOptions.map((o) => (
              <label key={o.value} className="mode-option">
                <input
                  type="radio"
                  name="mode"
                  value={o.value}
                  checked={mode === o.value}
                  onChange={() => setMode(o.value)}
                />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          <p className="mode-hint">{currentHint}</p>
          <div className="input-row">
            <input
              className="search-input"
              type="text"
              placeholder="주소 / 트랜잭션·블록 해시 / 블록 번호 / latest"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onSearch()
              }}
              aria-label="검색어"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="search-btn"
              onClick={() => void onSearch()}
              disabled={loading}
            >
              {loading ? '조회 중…' : '검색'}
            </button>
          </div>
        </div>
      </section>

      {result && <ResultView result={result} />}
    </div>
  )
}
