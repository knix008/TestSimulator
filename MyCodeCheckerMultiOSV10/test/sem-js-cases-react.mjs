// sem-js samples: React / JSX rules (core/sem-js/rules/react.js).
export default {
  'jsx-key': [
    {
      path: 'src/List.jsx',
      bad: `import React from 'react';

export function List({ items }) {
  return (
    <ul>
      {items.map((item) => <li>{item.name}</li>)} {/* Noncompliant */}
    </ul>
  );
}

export function Rows({ rows }) {
  return rows.map(function (r) {
    return <tr><td>{r.id}</td></tr>; // Noncompliant
  });
}

export function Menu() {
  return [<a href="/">Home</a>, <a href="/about">About</a>]; // Noncompliant
}

export function Stars({ n }) {
  return Array.from({ length: n }, () => <i className="star" />); // Noncompliant
}
`,
      good: `import React from 'react';

export function List({ items }) {
  return (
    <ul>
      {items.map((item) => <li key={item.id}>{item.name}</li>)}
    </ul>
  );
}

export function Rows({ rows }) {
  return rows.map((r) => <Row {...r} />);
}

export function Labels({ items }) {
  const names = items.map((item) => item.name);
  return <p>{names.join(', ')}</p>;
}

function Row({ id }) {
  return <tr><td>{id}</td></tr>;
}

export function Menu() {
  return [<a key="home" href="/">Home</a>, <a key="about" href="/about">About</a>];
}
`,
    },
    {
      lang: 'ts',
      path: 'src/Tags.tsx',
      bad: `import React from 'react';

interface Tag { id: string; label: string }

export function Tags({ tags }: { tags: Tag[] }) {
  return <div>{tags.map((t: Tag) => <span className="tag">{t.label}</span>)}</div>; // Noncompliant
}
`,
      good: `import React from 'react';

interface Tag { id: string; label: string }

export function Tags({ tags }: { tags: Tag[] }) {
  return <div>{tags.map((t: Tag) => <span key={t.id} className="tag">{t.label}</span>)}</div>;
}
`,
    },
  ],

  'hooks-rules': [
    {
      path: 'src/Profile.jsx',
      bad: `import { useState, useEffect } from 'react';

export function Profile({ user, compact }) {
  if (compact) {
    useEffect(() => { document.title = user.name; }); // Noncompliant
  }
  for (const f of user.friends) {
    useState(f); // Noncompliant
  }
  const [open, setOpen] = useState(false);
  return <div onClick={() => setOpen(!open)}>{user.name}</div>;
}

export function Badge({ hidden }) {
  if (hidden) return null;
  const [n, setN] = useState(0); // Noncompliant
  return <span onClick={() => setN(n + 1)}>{n}</span>;
}

function formatName(user) {
  const [cache] = useState({}); // Noncompliant
  return cache[user.id] || user.name;
}

export function Clicker() {
  const onClick = () => { useState(1); }; // Noncompliant
  return <button type="button" onClick={onClick}>{formatName({ id: 1 })}</button>;
}
`,
      good: `import { useState, useEffect, memo } from 'react';

export function Profile({ user, compact }) {
  const [open, setOpen] = useState(false);
  const label = () => { return user.name.toUpperCase(); };
  useEffect(() => { if (compact) document.title = label(); }, [compact]);
  if (!user) return null;
  return <div onClick={() => setOpen(!open)}>{user.name}</div>;
}

export function useToggle(initial) {
  const [on, setOn] = useState(initial);
  return [on, () => setOn(!on)];
}

export const Value = memo(function ({ v }) {
  const [x] = useState(v);
  return <i>{x}</i>;
});
`,
    },
    {
      lang: 'ts',
      path: 'src/useCounter.ts',
      bad: `import { useState, useCallback } from 'react';

export function useCounter(start: number, enabled: boolean) {
  const [n, setN] = useState<number>(start);
  const inc = enabled ? useCallback(() => setN(n + 1), [n]) : null; // Noncompliant
  return { n, inc };
}
`,
      good: `import { useState, useCallback } from 'react';

export function useCounter(start: number, enabled: boolean) {
  const [n, setN] = useState<number>(start);
  const inc = useCallback(() => { if (enabled) setN(n + 1); }, [n, enabled]);
  return { n, inc } as const;
}
`,
    },
  ],

  'state-mutation': {
    path: 'src/Counter.jsx',
    bad: `import React from 'react';

export class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  increment() {
    this.state.count++; // Noncompliant
  }

  reset() {
    this.state = { count: 0 }; // Noncompliant
  }

  render() {
    return <button type="button" onClick={() => this.increment()}>{this.state.count}</button>;
  }
}
`,
    good: `import React from 'react';

export class Counter extends React.Component {
  constructor(props) {
    super(props);
    this.state = { count: 0 };
  }

  increment() {
    this.setState((prev) => ({ count: prev.count + 1 }));
  }

  render() {
    return <button type="button" onClick={() => this.increment()}>{this.state.count}</button>;
  }
}

export class Machine {
  reset() {
    this.state = { step: 0 };
  }
}
`,
  },

  'jsx-duplicate-props': {
    path: 'src/Search.jsx',
    bad: `import React from 'react';

export function Search({ value, onChange, go }) {
  const field = <input type="text" value={value} onChange={onChange} type="search" />; // Noncompliant
  return (
    <form>
      {field}
      <Button primary onClick={go} primary>Go</Button> {/* Noncompliant */}
    </form>
  );
}

function Button(props) {
  return <button type="submit" {...props} />;
}
`,
    good: `import React from 'react';

export function Search({ value, onChange, go, extra }) {
  const field = <input type="search" value={value} onChange={onChange} />;
  return (
    <form>
      {field}
      <Button {...extra} primary onClick={go}>Go</Button>
    </form>
  );
}

function Button(props) {
  return <button type="submit" {...props} />;
}
`,
  },

  'access-state-in-setstate': {
    path: 'src/Likes.jsx',
    bad: `import React from 'react';

export class Likes extends React.Component {
  state = { count: 0, items: [] };

  like = () => {
    this.setState({ count: this.state.count + 1 }); // Noncompliant
  };

  add(item) {
    this.setState({
      items: [...this.state.items, item], // Noncompliant
    });
  }

  render() {
    return <button type="button" onClick={this.like}>{this.state.count}</button>;
  }
}
`,
    good: `import React from 'react';

export class Likes extends React.Component {
  state = { count: 0, items: [] };

  like = () => {
    this.setState((prev) => ({ count: prev.count + 1 }));
  };

  clear() {
    this.setState({ items: [] }, () => console.log(this.state.items.length));
  }

  render() {
    return <button type="button" onClick={this.like}>{this.state.count}</button>;
  }
}
`,
  },

  'jsx-comment-textnode': {
    path: 'src/Card.jsx',
    bad: `import React from 'react';

export function Card({ title }) {
  return (
    <div className="card">
      // the title of the card // Noncompliant
      <h2>{title}</h2>
      /* footer goes here */ {/* Noncompliant */}
    </div>
  );
}
`,
    good: `import React from 'react';

export function Card({ title, url }) {
  return (
    <div className="card">
      {/* the title of the card */}
      <h2>{title}</h2>
      <a href={url}>https://example.com/docs</a>
    </div>
  );
}
`,
  },

  'children-prop': {
    path: 'src/Panel.jsx',
    bad: `import React from 'react';

export function Page({ text }) {
  return (
    <main>
      <Panel title="Intro" children={<p>{text}</p>} /> {/* Noncompliant */}
      <Panel children="plain" /> {/* Noncompliant */}
    </main>
  );
}

function Panel({ title, children }) {
  return <section><h3>{title}</h3>{children}</section>;
}
`,
    good: `import React from 'react';

export function Page({ text }) {
  return (
    <main>
      <Panel title="Intro" childrenCount={1}>
        <p>{text}</p>
      </Panel>
    </main>
  );
}

function Panel({ title, children }) {
  return <section><h3>{title}</h3>{children}</section>;
}
`,
  },

  'void-dom-children': {
    path: 'src/Media.jsx',
    bad: `import React from 'react';

export function Media({ src, caption }) {
  return (
    <figure>
      <img src={src} alt="">{caption}</img> {/* Noncompliant */}
      <br children="x" /> {/* Noncompliant */}
      <hr dangerouslySetInnerHTML={{ __html: '<b>-</b>' }} /> {/* Noncompliant */}
    </figure>
  );
}
`,
    good: `import React from 'react';

export function Media({ src, caption }) {
  return (
    <figure>
      <img src={src} alt={caption} />
      <br />
      <Input label={caption}>hint</Input>
      <input value={caption} readOnly />
    </figure>
  );
}

function Input({ label, children }) {
  return <label>{label}<input />{children}</label>;
}
`,
  },

  'string-refs': {
    path: 'src/Form.jsx',
    bad: `import React from 'react';

export class Form extends React.Component {
  componentDidMount() {
    this.refs.name.focus();
  }

  render() {
    return (
      <form>
        <input ref="name" /> {/* Noncompliant */}
        <div ref={'box'} /> {/* Noncompliant */}
      </form>
    );
  }
}
`,
    good: `import React from 'react';

export class Form extends React.Component {
  nameRef = React.createRef();

  componentDidMount() {
    this.nameRef.current.focus();
  }

  render() {
    return (
      <form>
        <input ref={this.nameRef} />
        <div ref={(el) => { this.box = el; }} />
      </form>
    );
  }
}
`,
  },

  'render-return-value': {
    path: 'src/main.jsx',
    bad: `import ReactDOM from 'react-dom';
import { render } from 'react-dom';
import App from './App';

const instance = ReactDOM.render(<App />, document.getElementById('root')); // Noncompliant
instance.forceUpdate();
export const widget = render(<App mini />, document.getElementById('widget')); // Noncompliant
`,
    good: `import ReactDOM from 'react-dom';
import App from './App';

ReactDOM.render(<App />, document.getElementById('root'));

export function mount(el) {
  return ReactDOM.render(<App />, el);
}
const result = { render: () => 1 }.render();
export { result };
`,
  },

  'find-dom-node': {
    path: 'src/Focus.jsx',
    bad: `import React from 'react';
import ReactDOM, { findDOMNode } from 'react-dom';

export class Focus extends React.Component {
  componentDidMount() {
    ReactDOM.findDOMNode(this).focus(); // Noncompliant
    const node = findDOMNode(this); // Noncompliant
    node.scrollIntoView();
  }

  render() {
    return <div tabIndex={-1}>{this.props.children}</div>;
  }
}
`,
    good: `import React from 'react';

function findDOMNode(tree, id) {
  return tree.nodes.find((n) => n.id === id);
}

export class Focus extends React.Component {
  box = React.createRef();

  componentDidMount() {
    this.box.current.focus();
    findDOMNode(this.props.tree, 1);
  }

  render() {
    return <div ref={this.box} tabIndex={-1}>{this.props.children}</div>;
  }
}
`,
  },

  'useless-fragment': {
    path: 'src/Wrap.jsx',
    bad: `import React, { Fragment } from 'react';

export function One() {
  return <><Child /></>; // Noncompliant
}

export function Empty() {
  return <React.Fragment></React.Fragment>; // Noncompliant
}

export function Named() {
  return (
    <Fragment> {/* Noncompliant */}
      <Child />
    </Fragment>
  );
}

function Child() {
  return <p>child</p>;
}
`,
    good: `import React, { Fragment } from 'react';

export function Two() {
  return <><Child /><Child /></>;
}

export function Pass({ children }) {
  return <>{children}</>;
}

export function Keyed({ rows }) {
  return rows.map((r) => <Fragment key={r.id}><Child /></Fragment>);
}

function Child() {
  return <p>child</p>;
}
`,
  },

  'array-index-key': {
    path: 'src/Todos.jsx',
    bad: `import React from 'react';

export function Todos({ todos }) {
  return (
    <ul>
      {todos.map((todo, i) => <li key={i}>{todo.text}</li>)} {/* Noncompliant */}
      {todos.map((todo, index) => <Item key={\`todo-\${index}\`} todo={todo} />)} {/* Noncompliant */}
      {todos.map((todo, idx) => <Item key={idx.toString()} todo={todo} />)} {/* Noncompliant */}
      {todos.map((todo, n) => <Item key={'t' + n} todo={todo} />)} {/* Noncompliant */}
    </ul>
  );
}

function Item({ todo }) {
  return <li>{todo.text}</li>;
}
`,
    good: `import React from 'react';

export function Todos({ todos }) {
  const i = 0;
  return (
    <ul>
      {todos.map((todo, index) => <li key={todo.id} data-pos={index}>{todo.text}</li>)}
      {todos.map((todo) => <Item key={\`todo-\${todo.id}\`} todo={todo} index={i} />)}
    </ul>
  );
}

function Item({ todo }) {
  return <li>{todo.text}</li>;
}
`,
  },

  'effect-without-deps-sets-state': {
    path: 'src/Clock.jsx',
    bad: `import { useState, useEffect, useLayoutEffect } from 'react';

export function Clock() {
  const [now, setNow] = useState(Date.now());
  const [width, setWidth] = useState(0);
  useEffect(() => {
    setNow(Date.now()); // Noncompliant
  });
  useLayoutEffect(() => {
    const w = window.innerWidth;
    setWidth(w); // Noncompliant
  });
  return <time>{now} {width}</time>;
}
`,
    good: `import { useState, useEffect } from 'react';

export function Clock() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.title = String(now);
  });
  return <time>{now}</time>;
}
`,
  },

  'setstate-in-render': {
    path: 'src/Greeting.jsx',
    bad: `import { useState } from 'react';

export function Greeting({ name }) {
  const [label, setLabel] = useState('');
  setLabel(name.toUpperCase()); // Noncompliant
  return <h1>{label}</h1>;
}

export const Counter = ({ start }) => {
  const [n, setN] = useState(0);
  setN(start); // Noncompliant
  return <b>{n}</b>;
};
`,
    good: `import { useState } from 'react';

export function Greeting({ name }) {
  const [label, setLabel] = useState('');
  const [prev, setPrev] = useState(name);
  if (prev !== name) {
    setPrev(name);
    setLabel('');
  }
  return <h1 onClick={() => setLabel(name.toUpperCase())}>{label}</h1>;
}
`,
  },

  'setstate-same-value': {
    path: 'src/Stepper.jsx',
    bad: `import { useState } from 'react';

export function Stepper() {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setCount(count)}>+</button> {/* Noncompliant */}
      <button type="button" onClick={() => setOpen(open)}>toggle</button> {/* Noncompliant */}
    </div>
  );
}
`,
    good: `import { useState } from 'react';

export function Stepper({ initial }) {
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setCount(count + 1)}>+</button>
      <button type="button" onClick={() => setOpen(!open)}>toggle</button>
      <button type="button" onClick={() => setCount(initial)}>reset</button>
    </div>
  );
}
`,
  },

  'usestate-naming': [
    {
      path: 'src/Names.jsx',
      bad: `import { useState } from 'react';

export function Names() {
  const [value, setVal] = useState(''); // Noncompliant
  const [open, toggle] = useState(false); // Noncompliant
  return <input value={value} onFocus={() => toggle(!open)} onChange={(e) => setVal(e.target.value)} />;
}
`,
      good: `import { useState, useReducer } from 'react';

export function Names() {
  const [value, setValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setBusy] = useState(false);
  const [state, dispatch] = useReducer((s) => s, {});
  return <input value={value} data-s={state} disabled={isBusy} onFocus={() => { setIsOpen(!isOpen); setBusy(true); dispatch(); }} onChange={(e) => setValue(e.target.value)} />;
}
`,
    },
    {
      lang: 'ts',
      path: 'src/Names.tsx',
      bad: `import { useState } from 'react';

export function Names() {
  const [user, setName] = useState<string | null>(null); // Noncompliant
  return <p onClick={() => setName('x')}>{user!}</p>;
}
`,
      good: `import { useState } from 'react';

export function Names() {
  const [user, setUser] = useState<string | null>(null);
  return <p onClick={() => setUser('x' as string)}>{user!}</p>;
}
`,
    },
  ],

  'unstable-context-value': [
    {
      path: 'src/Theme.jsx',
      bad: `import React, { createContext, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}> {/* Noncompliant */}
      {children}
    </ThemeContext.Provider>
  );
}
`,
      good: `import React, { createContext, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}
`,
    },
    {
      lang: 'ts',
      path: 'src/Auth.tsx',
      bad: `import React, { createContext } from 'react';

type Auth = { login: () => void };
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={{ login: () => undefined } as Auth}>{children}</AuthContext.Provider>; // Noncompliant
}
`,
      good: `import React, { createContext } from 'react';

type Auth = { login: () => void };
const AuthContext = createContext<Auth | null>(null);
const AUTH: Auth = { login: () => undefined };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <AuthContext.Provider value={AUTH}>{children}</AuthContext.Provider>;
}
`,
    },
  ],

  'unstable-nested-component': {
    path: 'src/Table.jsx',
    bad: `import React from 'react';

export function Table({ rows }) {
  function Row({ r }) { // Noncompliant
    return <tr><td>{r.name}</td></tr>;
  }
  const Cell = ({ v }) => <td>{v}</td>; // Noncompliant
  return <table><tbody>{rows.map((r) => <Row key={r.id} r={r} />)}<tr><Cell v="total" /></tr></tbody></table>;
}
`,
    good: `import React from 'react';

function Row({ r }) {
  return <tr><td>{r.name}</td></tr>;
}

export function Table({ rows }) {
  const renderRow = (r) => <Row key={r.id} r={r} />;
  const Total = rows.length;
  return <table><tbody>{rows.map(renderRow)}<tr><td>{Total}</td></tr></tbody></table>;
}
`,
  },

  'button-type': [
    {
      path: 'src/Toolbar.jsx',
      bad: `import React from 'react';

export function Toolbar({ onSave }) {
  return (
    <div>
      <button onClick={onSave}>Save</button> {/* Noncompliant */}
      <button type="buton">Cancel</button> {/* Noncompliant */}
    </div>
  );
}
`,
      good: `import React from 'react';

export function Toolbar({ onSave, kind, rest }) {
  return (
    <form>
      <button type="button" onClick={onSave}>Save</button>
      <button type="submit">Send</button>
      <button type={kind}>Dynamic</button>
      <button {...rest}>Spread</button>
    </form>
  );
}
`,
    },
    {
      lang: 'ts',
      path: 'src/Btn.tsx',
      bad: `import React from 'react';

export const Btn = ({ label }: { label: string }) => <button className="btn">{label}</button>; // Noncompliant
`,
      good: `import React from 'react';

type Kind = 'button' | 'submit';
export const Btn = ({ label, kind }: { label: string; kind: Kind }) => <button type={kind} className="btn">{label}</button>;
`,
    },
  ],

  'react-deprecated': {
    path: 'src/Legacy.jsx',
    bad: `import React from 'react';
import ReactDOM from 'react-dom';

export class Legacy extends React.Component {
  componentWillMount() { // Noncompliant
    this.load();
  }

  componentWillReceiveProps(next) { // Noncompliant
    this.setState({ id: next.id });
  }

  load() {}

  render() {
    return <div>{this.props.id}</div>;
  }
}

Legacy.propTypes = { id: React.PropTypes.string }; // Noncompliant
const Old = React.createClass({ render() { return <p />; } }); // Noncompliant
ReactDOM.render(<Old />, document.getElementById('root')); // Noncompliant
ReactDOM.unmountComponentAtNode(document.getElementById('root')); // Noncompliant
`,
    good: `import React from 'react';
import PropTypes from 'prop-types';
import { createRoot } from 'react-dom/client';

export class Modern extends React.Component {
  componentDidMount() {
    this.load();
  }

  load() {}

  render() {
    return <div>{this.props.id}</div>;
  }
}

Modern.propTypes = { id: PropTypes.string };
const root = createRoot(document.getElementById('root'));
root.render(<Modern />);
root.unmount();
`,
  },

  'unsafe-lifecycle': {
    path: 'src/Unsafe.jsx',
    bad: `import React, { Component } from 'react';

export class Unsafe extends Component {
  UNSAFE_componentWillMount() { // Noncompliant
    this.start = Date.now();
  }

  UNSAFE_componentWillReceiveProps(next) { // Noncompliant
    this.next = next;
  }

  UNSAFE_componentWillUpdate() { // Noncompliant
    this.updating = true;
  }

  render() {
    return <span>{this.start}</span>;
  }
}
`,
    good: `import React, { Component } from 'react';

export class Safe extends Component {
  componentDidMount() {
    this.start = Date.now();
  }

  componentDidUpdate(prev) {
    this.prev = prev;
  }

  render() {
    return <span>{this.start}</span>;
  }
}

export class Plugin {
  UNSAFE_componentWillMount() {
    return 1;
  }
}
`,
  },

  'danger-with-children': {
    path: 'src/Html.jsx',
    bad: `import React from 'react';

export function Html({ html }) {
  return (
    <section>
      <div dangerouslySetInnerHTML={{ __html: html }}>fallback</div> {/* Noncompliant */}
      <p dangerouslySetInnerHTML={{ __html: html }} children="x" /> {/* Noncompliant */}
    </section>
  );
}
`,
    good: `import React from 'react';

export function Html({ html, text }) {
  return (
    <section>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <div dangerouslySetInnerHTML={{ __html: html }}>
      </div>
      <p>{text}</p>
    </section>
  );
}
`,
  },

  'is-mounted': {
    path: 'src/Loader.jsx',
    bad: `import React from 'react';

export class Loader extends React.Component {
  state = { data: null };

  componentDidMount() {
    fetch('/api').then((r) => r.json()).then((data) => {
      if (this.isMounted()) { // Noncompliant
        this.setState({ data });
      }
    });
  }

  render() {
    return <pre>{this.isMounted() ? 'mounted' : ''}</pre>; // Noncompliant
  }
}
`,
    good: `import React from 'react';

export class Loader extends React.Component {
  state = { data: null };

  componentDidMount() {
    this.active = true;
    fetch('/api').then((r) => r.json()).then((data) => {
      if (this.active) this.setState({ data });
    });
  }

  componentWillUnmount() {
    this.active = false;
  }

  render() {
    return <pre>{String(this.state.data)}</pre>;
  }
}

export class Widget {
  isMounted() { return !!this.el; }
  refresh() { return this.isMounted(); }
}
`,
  },

  'this-in-function-component': {
    path: 'src/Title.jsx',
    bad: `import React from 'react';

export function Title(props) {
  const size = this.props.size; // Noncompliant
  return <h1 className={size}>{props.text}</h1>;
}

export function Status() {
  return <p>{this.state.status}</p>; // Noncompliant
}
`,
    good: `import React from 'react';

export function Title(props) {
  return <h1 className={props.size}>{props.text}</h1>;
}

export class Status extends React.Component {
  render() {
    const show = () => <p>{this.state.status}</p>;
    return show();
  }
}

export function helper() {
  return this.props;
}
`,
  },

  'unknown-dom-property': {
    path: 'src/Signup.jsx',
    bad: `import React from 'react';

export function Signup({ submit }) {
  return (
    <form>
      <label class="field" htmlFor="email">Email</label> {/* Noncompliant */}
      <input id="email" onclick={submit} /> {/* Noncompliant */}
      <td colspan="2" /> {/* Noncompliant */}
    </form>
  );
}
`,
    good: `import React from 'react';

export function Signup({ submit }) {
  return (
    <form>
      <label className="field" htmlFor="email">Email</label>
      <input id="email" onClick={submit} tabIndex={0} aria-label="Email" data-testid="email" />
      <Field class="legacy" for="email" />
    </form>
  );
}

function Field(props) {
  return <span>{props.for}</span>;
}
`,
  },

  'conditional-render-zero': [
    {
      path: 'src/Inbox.jsx',
      bad: `import React from 'react';

export function Inbox({ items, unreadCount }) {
  return (
    <div>
      {items.length && <List items={items} />} {/* Noncompliant */}
      {unreadCount && <Badge n={unreadCount} />} {/* Noncompliant */}
    </div>
  );
}

function List({ items }) {
  return <ul>{items.map((i) => <li key={i.id}>{i.title}</li>)}</ul>;
}

function Badge({ n }) {
  return <b>{n}</b>;
}
`,
      good: `import React from 'react';

export function Inbox({ items, unreadCount, isOpen }) {
  return (
    <div>
      {items.length > 0 && <List items={items} />}
      {!!unreadCount && <Badge n={unreadCount} />}
      {isOpen && <Badge n={1} />}
    </div>
  );
}

function List({ items }) {
  return <ul>{items.map((i) => <li key={i.id}>{i.title}</li>)}</ul>;
}

function Badge({ n }) {
  return <b>{n}</b>;
}
`,
    },
  ],

  'props-mutation': {
    path: 'src/Title.jsx',
    bad: `import React from 'react';

export function Title(props) {
  if (!props.text) {
    props.text = 'Untitled'; // Noncompliant
  }
  props.style.color = 'red'; // Noncompliant
  props.renders++; // Noncompliant
  return <h1 style={props.style}>{props.text}</h1>;
}
`,
    good: `import React from 'react';

export function Title(props) {
  const text = props.text || 'Untitled';
  const style = { ...props.style, color: 'red' };
  return <h1 style={style}>{text}</h1>;
}

export function normalize(props) {
  props.text = String(props.text);
  return props;
}
`,
  },

  'jsx-undefined-component': {
    path: 'src/Layout.jsx',
    bad: `import React from 'react';
import { Sidebar } from './Sidebar';

export function Layout({ children }) {
  return (
    <div>
      <Header /> {/* Noncompliant */}
      <Sidebar />
      <main>{children}</main>
      <Footer year={2026} /> {/* Noncompliant */}
    </div>
  );
}
`,
    good: `import React, { Fragment } from 'react';
import { Sidebar } from './Sidebar';

function Header() {
  return <header>Site</header>;
}

export function Layout({ children, icons }) {
  const Footer = icons.Footer;
  return (
    <Fragment>
      <Header />
      <Sidebar />
      <main>{children}</main>
      <icons.Close />
      <Footer />
    </Fragment>
  );
}
`,
  },

  'react-dangerous-html': {
    path: 'src/Post.jsx',
    bad: `import React from 'react';

export function Post({ post, markup }) {
  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: post.body }} /> {/* Noncompliant */}
      <div dangerouslySetInnerHTML={markup} /> {/* Noncompliant */}
      <div dangerouslySetInnerHTML={{ __html: \`<b>\${post.title}</b>\` }} /> {/* Noncompliant */}
    </article>
  );
}
`,
    good: `import React from 'react';
import DOMPurify from 'dompurify';

export function Post({ post }) {
  return (
    <article>
      <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }} />
      <div dangerouslySetInnerHTML={{ __html: '<hr/>' }} />
      <div>{post.title}</div>
    </article>
  );
}
`,
  },
};
