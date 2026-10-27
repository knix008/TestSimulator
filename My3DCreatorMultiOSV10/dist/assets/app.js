(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))r(a);new MutationObserver(a=>{for(const l of a)if(l.type==="childList")for(const u of l.addedNodes)u.tagName==="LINK"&&u.rel==="modulepreload"&&r(u)}).observe(document,{childList:!0,subtree:!0});function t(a){const l={};return a.integrity&&(l.integrity=a.integrity),a.referrerPolicy&&(l.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?l.credentials="include":a.crossOrigin==="anonymous"?l.credentials="omit":l.credentials="same-origin",l}function r(a){if(a.ep)return;a.ep=!0;const l=t(a);fetch(a.href,l)}})();function B0(s){return s&&s.__esModule&&Object.prototype.hasOwnProperty.call(s,"default")?s.default:s}var qu={exports:{}},qo={},Zu={exports:{}},_t={};/**
 * @license React
 * react.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var hm;function Kv(){if(hm)return _t;hm=1;var s=Symbol.for("react.element"),e=Symbol.for("react.portal"),t=Symbol.for("react.fragment"),r=Symbol.for("react.strict_mode"),a=Symbol.for("react.profiler"),l=Symbol.for("react.provider"),u=Symbol.for("react.context"),d=Symbol.for("react.forward_ref"),h=Symbol.for("react.suspense"),m=Symbol.for("react.memo"),g=Symbol.for("react.lazy"),_=Symbol.iterator;function v(I){return I===null||typeof I!="object"?null:(I=_&&I[_]||I["@@iterator"],typeof I=="function"?I:null)}var M={isMounted:function(){return!1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},T=Object.assign,b={};function y(I,ie,be){this.props=I,this.context=ie,this.refs=b,this.updater=be||M}y.prototype.isReactComponent={},y.prototype.setState=function(I,ie){if(typeof I!="object"&&typeof I!="function"&&I!=null)throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");this.updater.enqueueSetState(this,I,ie,"setState")},y.prototype.forceUpdate=function(I){this.updater.enqueueForceUpdate(this,I,"forceUpdate")};function x(){}x.prototype=y.prototype;function L(I,ie,be){this.props=I,this.context=ie,this.refs=b,this.updater=be||M}var N=L.prototype=new x;N.constructor=L,T(N,y.prototype),N.isPureReactComponent=!0;var w=Array.isArray,O=Object.prototype.hasOwnProperty,D={current:null},F={key:!0,ref:!0,__self:!0,__source:!0};function B(I,ie,be){var ne,fe={},Se=null,xe=null;if(ie!=null)for(ne in ie.ref!==void 0&&(xe=ie.ref),ie.key!==void 0&&(Se=""+ie.key),ie)O.call(ie,ne)&&!F.hasOwnProperty(ne)&&(fe[ne]=ie[ne]);var Ae=arguments.length-2;if(Ae===1)fe.children=be;else if(1<Ae){for(var Ie=Array(Ae),Ce=0;Ce<Ae;Ce++)Ie[Ce]=arguments[Ce+2];fe.children=Ie}if(I&&I.defaultProps)for(ne in Ae=I.defaultProps,Ae)fe[ne]===void 0&&(fe[ne]=Ae[ne]);return{$$typeof:s,type:I,key:Se,ref:xe,props:fe,_owner:D.current}}function P(I,ie){return{$$typeof:s,type:I.type,key:ie,ref:I.ref,props:I.props,_owner:I._owner}}function A(I){return typeof I=="object"&&I!==null&&I.$$typeof===s}function H(I){var ie={"=":"=0",":":"=2"};return"$"+I.replace(/[=:]/g,function(be){return ie[be]})}var te=/\/+/g;function J(I,ie){return typeof I=="object"&&I!==null&&I.key!=null?H(""+I.key):ie.toString(36)}function oe(I,ie,be,ne,fe){var Se=typeof I;(Se==="undefined"||Se==="boolean")&&(I=null);var xe=!1;if(I===null)xe=!0;else switch(Se){case"string":case"number":xe=!0;break;case"object":switch(I.$$typeof){case s:case e:xe=!0}}if(xe)return xe=I,fe=fe(xe),I=ne===""?"."+J(xe,0):ne,w(fe)?(be="",I!=null&&(be=I.replace(te,"$&/")+"/"),oe(fe,ie,be,"",function(Ce){return Ce})):fe!=null&&(A(fe)&&(fe=P(fe,be+(!fe.key||xe&&xe.key===fe.key?"":(""+fe.key).replace(te,"$&/")+"/")+I)),ie.push(fe)),1;if(xe=0,ne=ne===""?".":ne+":",w(I))for(var Ae=0;Ae<I.length;Ae++){Se=I[Ae];var Ie=ne+J(Se,Ae);xe+=oe(Se,ie,be,Ie,fe)}else if(Ie=v(I),typeof Ie=="function")for(I=Ie.call(I),Ae=0;!(Se=I.next()).done;)Se=Se.value,Ie=ne+J(Se,Ae++),xe+=oe(Se,ie,be,Ie,fe);else if(Se==="object")throw ie=String(I),Error("Objects are not valid as a React child (found: "+(ie==="[object Object]"?"object with keys {"+Object.keys(I).join(", ")+"}":ie)+"). If you meant to render a collection of children, use an array instead.");return xe}function ce(I,ie,be){if(I==null)return I;var ne=[],fe=0;return oe(I,ne,"","",function(Se){return ie.call(be,Se,fe++)}),ne}function j(I){if(I._status===-1){var ie=I._result;ie=ie(),ie.then(function(be){(I._status===0||I._status===-1)&&(I._status=1,I._result=be)},function(be){(I._status===0||I._status===-1)&&(I._status=2,I._result=be)}),I._status===-1&&(I._status=0,I._result=ie)}if(I._status===1)return I._result.default;throw I._result}var Q={current:null},z={transition:null},X={ReactCurrentDispatcher:Q,ReactCurrentBatchConfig:z,ReactCurrentOwner:D};function q(){throw Error("act(...) is not supported in production builds of React.")}return _t.Children={map:ce,forEach:function(I,ie,be){ce(I,function(){ie.apply(this,arguments)},be)},count:function(I){var ie=0;return ce(I,function(){ie++}),ie},toArray:function(I){return ce(I,function(ie){return ie})||[]},only:function(I){if(!A(I))throw Error("React.Children.only expected to receive a single React element child.");return I}},_t.Component=y,_t.Fragment=t,_t.Profiler=a,_t.PureComponent=L,_t.StrictMode=r,_t.Suspense=h,_t.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=X,_t.act=q,_t.cloneElement=function(I,ie,be){if(I==null)throw Error("React.cloneElement(...): The argument must be a React element, but you passed "+I+".");var ne=T({},I.props),fe=I.key,Se=I.ref,xe=I._owner;if(ie!=null){if(ie.ref!==void 0&&(Se=ie.ref,xe=D.current),ie.key!==void 0&&(fe=""+ie.key),I.type&&I.type.defaultProps)var Ae=I.type.defaultProps;for(Ie in ie)O.call(ie,Ie)&&!F.hasOwnProperty(Ie)&&(ne[Ie]=ie[Ie]===void 0&&Ae!==void 0?Ae[Ie]:ie[Ie])}var Ie=arguments.length-2;if(Ie===1)ne.children=be;else if(1<Ie){Ae=Array(Ie);for(var Ce=0;Ce<Ie;Ce++)Ae[Ce]=arguments[Ce+2];ne.children=Ae}return{$$typeof:s,type:I.type,key:fe,ref:Se,props:ne,_owner:xe}},_t.createContext=function(I){return I={$$typeof:u,_currentValue:I,_currentValue2:I,_threadCount:0,Provider:null,Consumer:null,_defaultValue:null,_globalName:null},I.Provider={$$typeof:l,_context:I},I.Consumer=I},_t.createElement=B,_t.createFactory=function(I){var ie=B.bind(null,I);return ie.type=I,ie},_t.createRef=function(){return{current:null}},_t.forwardRef=function(I){return{$$typeof:d,render:I}},_t.isValidElement=A,_t.lazy=function(I){return{$$typeof:g,_payload:{_status:-1,_result:I},_init:j}},_t.memo=function(I,ie){return{$$typeof:m,type:I,compare:ie===void 0?null:ie}},_t.startTransition=function(I){var ie=z.transition;z.transition={};try{I()}finally{z.transition=ie}},_t.unstable_act=q,_t.useCallback=function(I,ie){return Q.current.useCallback(I,ie)},_t.useContext=function(I){return Q.current.useContext(I)},_t.useDebugValue=function(){},_t.useDeferredValue=function(I){return Q.current.useDeferredValue(I)},_t.useEffect=function(I,ie){return Q.current.useEffect(I,ie)},_t.useId=function(){return Q.current.useId()},_t.useImperativeHandle=function(I,ie,be){return Q.current.useImperativeHandle(I,ie,be)},_t.useInsertionEffect=function(I,ie){return Q.current.useInsertionEffect(I,ie)},_t.useLayoutEffect=function(I,ie){return Q.current.useLayoutEffect(I,ie)},_t.useMemo=function(I,ie){return Q.current.useMemo(I,ie)},_t.useReducer=function(I,ie,be){return Q.current.useReducer(I,ie,be)},_t.useRef=function(I){return Q.current.useRef(I)},_t.useState=function(I){return Q.current.useState(I)},_t.useSyncExternalStore=function(I,ie,be){return Q.current.useSyncExternalStore(I,ie,be)},_t.useTransition=function(){return Q.current.useTransition()},_t.version="18.3.1",_t}var pm;function Pf(){return pm||(pm=1,Zu.exports=Kv()),Zu.exports}/**
 * @license React
 * react-jsx-runtime.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var mm;function Qv(){if(mm)return qo;mm=1;var s=Pf(),e=Symbol.for("react.element"),t=Symbol.for("react.fragment"),r=Object.prototype.hasOwnProperty,a=s.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner,l={key:!0,ref:!0,__self:!0,__source:!0};function u(d,h,m){var g,_={},v=null,M=null;m!==void 0&&(v=""+m),h.key!==void 0&&(v=""+h.key),h.ref!==void 0&&(M=h.ref);for(g in h)r.call(h,g)&&!l.hasOwnProperty(g)&&(_[g]=h[g]);if(d&&d.defaultProps)for(g in h=d.defaultProps,h)_[g]===void 0&&(_[g]=h[g]);return{$$typeof:e,type:d,key:v,ref:M,props:_,_owner:a.current}}return qo.Fragment=t,qo.jsx=u,qo.jsxs=u,qo}var gm;function Jv(){return gm||(gm=1,qu.exports=Qv()),qu.exports}var S=Jv(),nt=Pf();const e_=B0(nt);var Sl={},Ku={exports:{}},Hn={},Qu={exports:{}},Ju={};/**
 * @license React
 * scheduler.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var xm;function t_(){return xm||(xm=1,(function(s){function e(z,X){var q=z.length;z.push(X);e:for(;0<q;){var I=q-1>>>1,ie=z[I];if(0<a(ie,X))z[I]=X,z[q]=ie,q=I;else break e}}function t(z){return z.length===0?null:z[0]}function r(z){if(z.length===0)return null;var X=z[0],q=z.pop();if(q!==X){z[0]=q;e:for(var I=0,ie=z.length,be=ie>>>1;I<be;){var ne=2*(I+1)-1,fe=z[ne],Se=ne+1,xe=z[Se];if(0>a(fe,q))Se<ie&&0>a(xe,fe)?(z[I]=xe,z[Se]=q,I=Se):(z[I]=fe,z[ne]=q,I=ne);else if(Se<ie&&0>a(xe,q))z[I]=xe,z[Se]=q,I=Se;else break e}}return X}function a(z,X){var q=z.sortIndex-X.sortIndex;return q!==0?q:z.id-X.id}if(typeof performance=="object"&&typeof performance.now=="function"){var l=performance;s.unstable_now=function(){return l.now()}}else{var u=Date,d=u.now();s.unstable_now=function(){return u.now()-d}}var h=[],m=[],g=1,_=null,v=3,M=!1,T=!1,b=!1,y=typeof setTimeout=="function"?setTimeout:null,x=typeof clearTimeout=="function"?clearTimeout:null,L=typeof setImmediate<"u"?setImmediate:null;typeof navigator<"u"&&navigator.scheduling!==void 0&&navigator.scheduling.isInputPending!==void 0&&navigator.scheduling.isInputPending.bind(navigator.scheduling);function N(z){for(var X=t(m);X!==null;){if(X.callback===null)r(m);else if(X.startTime<=z)r(m),X.sortIndex=X.expirationTime,e(h,X);else break;X=t(m)}}function w(z){if(b=!1,N(z),!T)if(t(h)!==null)T=!0,j(O);else{var X=t(m);X!==null&&Q(w,X.startTime-z)}}function O(z,X){T=!1,b&&(b=!1,x(B),B=-1),M=!0;var q=v;try{for(N(X),_=t(h);_!==null&&(!(_.expirationTime>X)||z&&!H());){var I=_.callback;if(typeof I=="function"){_.callback=null,v=_.priorityLevel;var ie=I(_.expirationTime<=X);X=s.unstable_now(),typeof ie=="function"?_.callback=ie:_===t(h)&&r(h),N(X)}else r(h);_=t(h)}if(_!==null)var be=!0;else{var ne=t(m);ne!==null&&Q(w,ne.startTime-X),be=!1}return be}finally{_=null,v=q,M=!1}}var D=!1,F=null,B=-1,P=5,A=-1;function H(){return!(s.unstable_now()-A<P)}function te(){if(F!==null){var z=s.unstable_now();A=z;var X=!0;try{X=F(!0,z)}finally{X?J():(D=!1,F=null)}}else D=!1}var J;if(typeof L=="function")J=function(){L(te)};else if(typeof MessageChannel<"u"){var oe=new MessageChannel,ce=oe.port2;oe.port1.onmessage=te,J=function(){ce.postMessage(null)}}else J=function(){y(te,0)};function j(z){F=z,D||(D=!0,J())}function Q(z,X){B=y(function(){z(s.unstable_now())},X)}s.unstable_IdlePriority=5,s.unstable_ImmediatePriority=1,s.unstable_LowPriority=4,s.unstable_NormalPriority=3,s.unstable_Profiling=null,s.unstable_UserBlockingPriority=2,s.unstable_cancelCallback=function(z){z.callback=null},s.unstable_continueExecution=function(){T||M||(T=!0,j(O))},s.unstable_forceFrameRate=function(z){0>z||125<z?console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported"):P=0<z?Math.floor(1e3/z):5},s.unstable_getCurrentPriorityLevel=function(){return v},s.unstable_getFirstCallbackNode=function(){return t(h)},s.unstable_next=function(z){switch(v){case 1:case 2:case 3:var X=3;break;default:X=v}var q=v;v=X;try{return z()}finally{v=q}},s.unstable_pauseExecution=function(){},s.unstable_requestPaint=function(){},s.unstable_runWithPriority=function(z,X){switch(z){case 1:case 2:case 3:case 4:case 5:break;default:z=3}var q=v;v=z;try{return X()}finally{v=q}},s.unstable_scheduleCallback=function(z,X,q){var I=s.unstable_now();switch(typeof q=="object"&&q!==null?(q=q.delay,q=typeof q=="number"&&0<q?I+q:I):q=I,z){case 1:var ie=-1;break;case 2:ie=250;break;case 5:ie=1073741823;break;case 4:ie=1e4;break;default:ie=5e3}return ie=q+ie,z={id:g++,callback:X,priorityLevel:z,startTime:q,expirationTime:ie,sortIndex:-1},q>I?(z.sortIndex=q,e(m,z),t(h)===null&&z===t(m)&&(b?(x(B),B=-1):b=!0,Q(w,q-I))):(z.sortIndex=ie,e(h,z),T||M||(T=!0,j(O))),z},s.unstable_shouldYield=H,s.unstable_wrapCallback=function(z){var X=v;return function(){var q=v;v=X;try{return z.apply(this,arguments)}finally{v=q}}}})(Ju)),Ju}var vm;function n_(){return vm||(vm=1,Qu.exports=t_()),Qu.exports}/**
 * @license React
 * react-dom.production.min.js
 *
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */var _m;function i_(){if(_m)return Hn;_m=1;var s=Pf(),e=n_();function t(n){for(var i="https://reactjs.org/docs/error-decoder.html?invariant="+n,o=1;o<arguments.length;o++)i+="&args[]="+encodeURIComponent(arguments[o]);return"Minified React error #"+n+"; visit "+i+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}var r=new Set,a={};function l(n,i){u(n,i),u(n+"Capture",i)}function u(n,i){for(a[n]=i,n=0;n<i.length;n++)r.add(i[n])}var d=!(typeof window>"u"||typeof window.document>"u"||typeof window.document.createElement>"u"),h=Object.prototype.hasOwnProperty,m=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,g={},_={};function v(n){return h.call(_,n)?!0:h.call(g,n)?!1:m.test(n)?_[n]=!0:(g[n]=!0,!1)}function M(n,i,o,c){if(o!==null&&o.type===0)return!1;switch(typeof i){case"function":case"symbol":return!0;case"boolean":return c?!1:o!==null?!o.acceptsBooleans:(n=n.toLowerCase().slice(0,5),n!=="data-"&&n!=="aria-");default:return!1}}function T(n,i,o,c){if(i===null||typeof i>"u"||M(n,i,o,c))return!0;if(c)return!1;if(o!==null)switch(o.type){case 3:return!i;case 4:return i===!1;case 5:return isNaN(i);case 6:return isNaN(i)||1>i}return!1}function b(n,i,o,c,f,p,E){this.acceptsBooleans=i===2||i===3||i===4,this.attributeName=c,this.attributeNamespace=f,this.mustUseProperty=o,this.propertyName=n,this.type=i,this.sanitizeURL=p,this.removeEmptyString=E}var y={};"children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(n){y[n]=new b(n,0,!1,n,null,!1,!1)}),[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(n){var i=n[0];y[i]=new b(i,1,!1,n[1],null,!1,!1)}),["contentEditable","draggable","spellCheck","value"].forEach(function(n){y[n]=new b(n,2,!1,n.toLowerCase(),null,!1,!1)}),["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(n){y[n]=new b(n,2,!1,n,null,!1,!1)}),"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture disableRemotePlayback formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(n){y[n]=new b(n,3,!1,n.toLowerCase(),null,!1,!1)}),["checked","multiple","muted","selected"].forEach(function(n){y[n]=new b(n,3,!0,n,null,!1,!1)}),["capture","download"].forEach(function(n){y[n]=new b(n,4,!1,n,null,!1,!1)}),["cols","rows","size","span"].forEach(function(n){y[n]=new b(n,6,!1,n,null,!1,!1)}),["rowSpan","start"].forEach(function(n){y[n]=new b(n,5,!1,n.toLowerCase(),null,!1,!1)});var x=/[\-:]([a-z])/g;function L(n){return n[1].toUpperCase()}"accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(n){var i=n.replace(x,L);y[i]=new b(i,1,!1,n,null,!1,!1)}),"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(n){var i=n.replace(x,L);y[i]=new b(i,1,!1,n,"http://www.w3.org/1999/xlink",!1,!1)}),["xml:base","xml:lang","xml:space"].forEach(function(n){var i=n.replace(x,L);y[i]=new b(i,1,!1,n,"http://www.w3.org/XML/1998/namespace",!1,!1)}),["tabIndex","crossOrigin"].forEach(function(n){y[n]=new b(n,1,!1,n.toLowerCase(),null,!1,!1)}),y.xlinkHref=new b("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0,!1),["src","href","action","formAction"].forEach(function(n){y[n]=new b(n,1,!1,n.toLowerCase(),null,!0,!0)});function N(n,i,o,c){var f=y.hasOwnProperty(i)?y[i]:null;(f!==null?f.type!==0:c||!(2<i.length)||i[0]!=="o"&&i[0]!=="O"||i[1]!=="n"&&i[1]!=="N")&&(T(i,o,f,c)&&(o=null),c||f===null?v(i)&&(o===null?n.removeAttribute(i):n.setAttribute(i,""+o)):f.mustUseProperty?n[f.propertyName]=o===null?f.type===3?!1:"":o:(i=f.attributeName,c=f.attributeNamespace,o===null?n.removeAttribute(i):(f=f.type,o=f===3||f===4&&o===!0?"":""+o,c?n.setAttributeNS(c,i,o):n.setAttribute(i,o))))}var w=s.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,O=Symbol.for("react.element"),D=Symbol.for("react.portal"),F=Symbol.for("react.fragment"),B=Symbol.for("react.strict_mode"),P=Symbol.for("react.profiler"),A=Symbol.for("react.provider"),H=Symbol.for("react.context"),te=Symbol.for("react.forward_ref"),J=Symbol.for("react.suspense"),oe=Symbol.for("react.suspense_list"),ce=Symbol.for("react.memo"),j=Symbol.for("react.lazy"),Q=Symbol.for("react.offscreen"),z=Symbol.iterator;function X(n){return n===null||typeof n!="object"?null:(n=z&&n[z]||n["@@iterator"],typeof n=="function"?n:null)}var q=Object.assign,I;function ie(n){if(I===void 0)try{throw Error()}catch(o){var i=o.stack.trim().match(/\n( *(at )?)/);I=i&&i[1]||""}return`
`+I+n}var be=!1;function ne(n,i){if(!n||be)return"";be=!0;var o=Error.prepareStackTrace;Error.prepareStackTrace=void 0;try{if(i)if(i=function(){throw Error()},Object.defineProperty(i.prototype,"props",{set:function(){throw Error()}}),typeof Reflect=="object"&&Reflect.construct){try{Reflect.construct(i,[])}catch(ae){var c=ae}Reflect.construct(n,[],i)}else{try{i.call()}catch(ae){c=ae}n.call(i.prototype)}else{try{throw Error()}catch(ae){c=ae}n()}}catch(ae){if(ae&&c&&typeof ae.stack=="string"){for(var f=ae.stack.split(`
`),p=c.stack.split(`
`),E=f.length-1,k=p.length-1;1<=E&&0<=k&&f[E]!==p[k];)k--;for(;1<=E&&0<=k;E--,k--)if(f[E]!==p[k]){if(E!==1||k!==1)do if(E--,k--,0>k||f[E]!==p[k]){var G=`
`+f[E].replace(" at new "," at ");return n.displayName&&G.includes("<anonymous>")&&(G=G.replace("<anonymous>",n.displayName)),G}while(1<=E&&0<=k);break}}}finally{be=!1,Error.prepareStackTrace=o}return(n=n?n.displayName||n.name:"")?ie(n):""}function fe(n){switch(n.tag){case 5:return ie(n.type);case 16:return ie("Lazy");case 13:return ie("Suspense");case 19:return ie("SuspenseList");case 0:case 2:case 15:return n=ne(n.type,!1),n;case 11:return n=ne(n.type.render,!1),n;case 1:return n=ne(n.type,!0),n;default:return""}}function Se(n){if(n==null)return null;if(typeof n=="function")return n.displayName||n.name||null;if(typeof n=="string")return n;switch(n){case F:return"Fragment";case D:return"Portal";case P:return"Profiler";case B:return"StrictMode";case J:return"Suspense";case oe:return"SuspenseList"}if(typeof n=="object")switch(n.$$typeof){case H:return(n.displayName||"Context")+".Consumer";case A:return(n._context.displayName||"Context")+".Provider";case te:var i=n.render;return n=n.displayName,n||(n=i.displayName||i.name||"",n=n!==""?"ForwardRef("+n+")":"ForwardRef"),n;case ce:return i=n.displayName||null,i!==null?i:Se(n.type)||"Memo";case j:i=n._payload,n=n._init;try{return Se(n(i))}catch{}}return null}function xe(n){var i=n.type;switch(n.tag){case 24:return"Cache";case 9:return(i.displayName||"Context")+".Consumer";case 10:return(i._context.displayName||"Context")+".Provider";case 18:return"DehydratedFragment";case 11:return n=i.render,n=n.displayName||n.name||"",i.displayName||(n!==""?"ForwardRef("+n+")":"ForwardRef");case 7:return"Fragment";case 5:return i;case 4:return"Portal";case 3:return"Root";case 6:return"Text";case 16:return Se(i);case 8:return i===B?"StrictMode":"Mode";case 22:return"Offscreen";case 12:return"Profiler";case 21:return"Scope";case 13:return"Suspense";case 19:return"SuspenseList";case 25:return"TracingMarker";case 1:case 0:case 17:case 2:case 14:case 15:if(typeof i=="function")return i.displayName||i.name||null;if(typeof i=="string")return i}return null}function Ae(n){switch(typeof n){case"boolean":case"number":case"string":case"undefined":return n;case"object":return n;default:return""}}function Ie(n){var i=n.type;return(n=n.nodeName)&&n.toLowerCase()==="input"&&(i==="checkbox"||i==="radio")}function Ce(n){var i=Ie(n)?"checked":"value",o=Object.getOwnPropertyDescriptor(n.constructor.prototype,i),c=""+n[i];if(!n.hasOwnProperty(i)&&typeof o<"u"&&typeof o.get=="function"&&typeof o.set=="function"){var f=o.get,p=o.set;return Object.defineProperty(n,i,{configurable:!0,get:function(){return f.call(this)},set:function(E){c=""+E,p.call(this,E)}}),Object.defineProperty(n,i,{enumerable:o.enumerable}),{getValue:function(){return c},setValue:function(E){c=""+E},stopTracking:function(){n._valueTracker=null,delete n[i]}}}}function Ze(n){n._valueTracker||(n._valueTracker=Ce(n))}function Ke(n){if(!n)return!1;var i=n._valueTracker;if(!i)return!0;var o=i.getValue(),c="";return n&&(c=Ie(n)?n.checked?"true":"false":n.value),n=c,n!==o?(i.setValue(n),!0):!1}function gt(n){if(n=n||(typeof document<"u"?document:void 0),typeof n>"u")return null;try{return n.activeElement||n.body}catch{return n.body}}function Y(n,i){var o=i.checked;return q({},i,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:o??n._wrapperState.initialChecked})}function dn(n,i){var o=i.defaultValue==null?"":i.defaultValue,c=i.checked!=null?i.checked:i.defaultChecked;o=Ae(i.value!=null?i.value:o),n._wrapperState={initialChecked:c,initialValue:o,controlled:i.type==="checkbox"||i.type==="radio"?i.checked!=null:i.value!=null}}function yt(n,i){i=i.checked,i!=null&&N(n,"checked",i,!1)}function xt(n,i){yt(n,i);var o=Ae(i.value),c=i.type;if(o!=null)c==="number"?(o===0&&n.value===""||n.value!=o)&&(n.value=""+o):n.value!==""+o&&(n.value=""+o);else if(c==="submit"||c==="reset"){n.removeAttribute("value");return}i.hasOwnProperty("value")?Pt(n,i.type,o):i.hasOwnProperty("defaultValue")&&Pt(n,i.type,Ae(i.defaultValue)),i.checked==null&&i.defaultChecked!=null&&(n.defaultChecked=!!i.defaultChecked)}function Qe(n,i,o){if(i.hasOwnProperty("value")||i.hasOwnProperty("defaultValue")){var c=i.type;if(!(c!=="submit"&&c!=="reset"||i.value!==void 0&&i.value!==null))return;i=""+n._wrapperState.initialValue,o||i===n.value||(n.value=i),n.defaultValue=i}o=n.name,o!==""&&(n.name=""),n.defaultChecked=!!n._wrapperState.initialChecked,o!==""&&(n.name=o)}function Pt(n,i,o){(i!=="number"||gt(n.ownerDocument)!==n)&&(o==null?n.defaultValue=""+n._wrapperState.initialValue:n.defaultValue!==""+o&&(n.defaultValue=""+o))}var qe=Array.isArray;function U(n,i,o,c){if(n=n.options,i){i={};for(var f=0;f<o.length;f++)i["$"+o[f]]=!0;for(o=0;o<n.length;o++)f=i.hasOwnProperty("$"+n[o].value),n[o].selected!==f&&(n[o].selected=f),f&&c&&(n[o].defaultSelected=!0)}else{for(o=""+Ae(o),i=null,f=0;f<n.length;f++){if(n[f].value===o){n[f].selected=!0,c&&(n[f].defaultSelected=!0);return}i!==null||n[f].disabled||(i=n[f])}i!==null&&(i.selected=!0)}}function C(n,i){if(i.dangerouslySetInnerHTML!=null)throw Error(t(91));return q({},i,{value:void 0,defaultValue:void 0,children:""+n._wrapperState.initialValue})}function se(n,i){var o=i.value;if(o==null){if(o=i.children,i=i.defaultValue,o!=null){if(i!=null)throw Error(t(92));if(qe(o)){if(1<o.length)throw Error(t(93));o=o[0]}i=o}i==null&&(i=""),o=i}n._wrapperState={initialValue:Ae(o)}}function me(n,i){var o=Ae(i.value),c=Ae(i.defaultValue);o!=null&&(o=""+o,o!==n.value&&(n.value=o),i.defaultValue==null&&n.defaultValue!==o&&(n.defaultValue=o)),c!=null&&(n.defaultValue=""+c)}function ve(n){var i=n.textContent;i===n._wrapperState.initialValue&&i!==""&&i!==null&&(n.value=i)}function he(n){switch(n){case"svg":return"http://www.w3.org/2000/svg";case"math":return"http://www.w3.org/1998/Math/MathML";default:return"http://www.w3.org/1999/xhtml"}}function je(n,i){return n==null||n==="http://www.w3.org/1999/xhtml"?he(i):n==="http://www.w3.org/2000/svg"&&i==="foreignObject"?"http://www.w3.org/1999/xhtml":n}var Re,ke=(function(n){return typeof MSApp<"u"&&MSApp.execUnsafeLocalFunction?function(i,o,c,f){MSApp.execUnsafeLocalFunction(function(){return n(i,o,c,f)})}:n})(function(n,i){if(n.namespaceURI!=="http://www.w3.org/2000/svg"||"innerHTML"in n)n.innerHTML=i;else{for(Re=Re||document.createElement("div"),Re.innerHTML="<svg>"+i.valueOf().toString()+"</svg>",i=Re.firstChild;n.firstChild;)n.removeChild(n.firstChild);for(;i.firstChild;)n.appendChild(i.firstChild)}});function pt(n,i){if(i){var o=n.firstChild;if(o&&o===n.lastChild&&o.nodeType===3){o.nodeValue=i;return}}n.textContent=i}var Me={animationIterationCount:!0,aspectRatio:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},ze=["Webkit","ms","Moz","O"];Object.keys(Me).forEach(function(n){ze.forEach(function(i){i=i+n.charAt(0).toUpperCase()+n.substring(1),Me[i]=Me[n]})});function tt(n,i,o){return i==null||typeof i=="boolean"||i===""?"":o||typeof i!="number"||i===0||Me.hasOwnProperty(n)&&Me[n]?(""+i).trim():i+"px"}function it(n,i){n=n.style;for(var o in i)if(i.hasOwnProperty(o)){var c=o.indexOf("--")===0,f=tt(o,i[o],c);o==="float"&&(o="cssFloat"),c?n.setProperty(o,f):n[o]=f}}var Be=q({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});function vt(n,i){if(i){if(Be[n]&&(i.children!=null||i.dangerouslySetInnerHTML!=null))throw Error(t(137,n));if(i.dangerouslySetInnerHTML!=null){if(i.children!=null)throw Error(t(60));if(typeof i.dangerouslySetInnerHTML!="object"||!("__html"in i.dangerouslySetInnerHTML))throw Error(t(61))}if(i.style!=null&&typeof i.style!="object")throw Error(t(62))}}function at(n,i){if(n.indexOf("-")===-1)return typeof i.is=="string";switch(n){case"annotation-xml":case"color-profile":case"font-face":case"font-face-src":case"font-face-uri":case"font-face-format":case"font-face-name":case"missing-glyph":return!1;default:return!0}}var Rt=null;function $(n){return n=n.target||n.srcElement||window,n.correspondingUseElement&&(n=n.correspondingUseElement),n.nodeType===3?n.parentNode:n}var Pe=null,de=null,pe=null;function De(n){if(n=Io(n)){if(typeof Pe!="function")throw Error(t(280));var i=n.stateNode;i&&(i=Fa(i),Pe(n.stateNode,n.type,i))}}function Le(n){de?pe?pe.push(n):pe=[n]:de=n}function lt(){if(de){var n=de,i=pe;if(pe=de=null,De(n),i)for(n=0;n<i.length;n++)De(i[n])}}function Ot(n,i){return n(i)}function en(){}var Et=!1;function In(n,i,o){if(Et)return n(i,o);Et=!0;try{return Ot(n,i,o)}finally{Et=!1,(de!==null||pe!==null)&&(en(),lt())}}function Tn(n,i){var o=n.stateNode;if(o===null)return null;var c=Fa(o);if(c===null)return null;o=c[i];e:switch(i){case"onClick":case"onClickCapture":case"onDoubleClick":case"onDoubleClickCapture":case"onMouseDown":case"onMouseDownCapture":case"onMouseMove":case"onMouseMoveCapture":case"onMouseUp":case"onMouseUpCapture":case"onMouseEnter":(c=!c.disabled)||(n=n.type,c=!(n==="button"||n==="input"||n==="select"||n==="textarea")),n=!c;break e;default:n=!1}if(n)return null;if(o&&typeof o!="function")throw Error(t(231,i,typeof o));return o}var ms=!1;if(d)try{var nr={};Object.defineProperty(nr,"passive",{get:function(){ms=!0}}),window.addEventListener("test",nr,nr),window.removeEventListener("test",nr,nr)}catch{ms=!1}function Di(n,i,o,c,f,p,E,k,G){var ae=Array.prototype.slice.call(arguments,3);try{i.apply(o,ae)}catch(_e){this.onError(_e)}}var Ii=!1,Fr=null,kr=!1,ir=null,ga={onError:function(n){Ii=!0,Fr=n}};function gs(n,i,o,c,f,p,E,k,G){Ii=!1,Fr=null,Di.apply(ga,arguments)}function xa(n,i,o,c,f,p,E,k,G){if(gs.apply(this,arguments),Ii){if(Ii){var ae=Fr;Ii=!1,Fr=null}else throw Error(t(198));kr||(kr=!0,ir=ae)}}function Ei(n){var i=n,o=n;if(n.alternate)for(;i.return;)i=i.return;else{n=i;do i=n,(i.flags&4098)!==0&&(o=i.return),n=i.return;while(n)}return i.tag===3?o:null}function va(n){if(n.tag===13){var i=n.memoizedState;if(i===null&&(n=n.alternate,n!==null&&(i=n.memoizedState)),i!==null)return i.dehydrated}return null}function _a(n){if(Ei(n)!==n)throw Error(t(188))}function xc(n){var i=n.alternate;if(!i){if(i=Ei(n),i===null)throw Error(t(188));return i!==n?null:n}for(var o=n,c=i;;){var f=o.return;if(f===null)break;var p=f.alternate;if(p===null){if(c=f.return,c!==null){o=c;continue}break}if(f.child===p.child){for(p=f.child;p;){if(p===o)return _a(f),n;if(p===c)return _a(f),i;p=p.sibling}throw Error(t(188))}if(o.return!==c.return)o=f,c=p;else{for(var E=!1,k=f.child;k;){if(k===o){E=!0,o=f,c=p;break}if(k===c){E=!0,c=f,o=p;break}k=k.sibling}if(!E){for(k=p.child;k;){if(k===o){E=!0,o=p,c=f;break}if(k===c){E=!0,c=p,o=f;break}k=k.sibling}if(!E)throw Error(t(189))}}if(o.alternate!==c)throw Error(t(190))}if(o.tag!==3)throw Error(t(188));return o.stateNode.current===o?n:i}function R(n){return n=xc(n),n!==null?Z(n):null}function Z(n){if(n.tag===5||n.tag===6)return n;for(n=n.child;n!==null;){var i=Z(n);if(i!==null)return i;n=n.sibling}return null}var le=e.unstable_scheduleCallback,ue=e.unstable_cancelCallback,K=e.unstable_shouldYield,Te=e.unstable_requestPaint,Ee=e.unstable_now,We=e.unstable_getCurrentPriorityLevel,Ve=e.unstable_ImmediatePriority,rt=e.unstable_UserBlockingPriority,ot=e.unstable_NormalPriority,Xe=e.unstable_LowPriority,Mt=e.unstable_IdlePriority,Ct=null,St=null;function mn(n){if(St&&typeof St.onCommitFiberRoot=="function")try{St.onCommitFiberRoot(Ct,n,void 0,(n.current.flags&128)===128)}catch{}}var ct=Math.clz32?Math.clz32:bt,Ye=Math.log,ai=Math.LN2;function bt(n){return n>>>=0,n===0?32:31-(Ye(n)/ai|0)|0}var gn=64,li=4194304;function tn(n){switch(n&-n){case 1:return 1;case 2:return 2;case 4:return 4;case 8:return 8;case 16:return 16;case 32:return 32;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return n&4194240;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return n&130023424;case 134217728:return 134217728;case 268435456:return 268435456;case 536870912:return 536870912;case 1073741824:return 1073741824;default:return n}}function wi(n,i){var o=n.pendingLanes;if(o===0)return 0;var c=0,f=n.suspendedLanes,p=n.pingedLanes,E=o&268435455;if(E!==0){var k=E&~f;k!==0?c=tn(k):(p&=E,p!==0&&(c=tn(p)))}else E=o&~f,E!==0?c=tn(E):p!==0&&(c=tn(p));if(c===0)return 0;if(i!==0&&i!==c&&(i&f)===0&&(f=c&-c,p=i&-i,f>=p||f===16&&(p&4194240)!==0))return i;if((c&4)!==0&&(c|=o&16),i=n.entangledLanes,i!==0)for(n=n.entanglements,i&=c;0<i;)o=31-ct(i),f=1<<o,c|=n[o],i&=~f;return c}function It(n,i){switch(n){case 1:case 2:case 4:return i+250;case 8:case 16:case 32:case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:return i+5e3;case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:return-1;case 134217728:case 268435456:case 536870912:case 1073741824:return-1;default:return-1}}function qn(n,i){for(var o=n.suspendedLanes,c=n.pingedLanes,f=n.expirationTimes,p=n.pendingLanes;0<p;){var E=31-ct(p),k=1<<E,G=f[E];G===-1?((k&o)===0||(k&c)!==0)&&(f[E]=It(k,i)):G<=i&&(n.expiredLanes|=k),p&=~k}}function Ui(n){return n=n.pendingLanes&-1073741825,n!==0?n:n&1073741824?1073741824:0}function bn(){var n=gn;return gn<<=1,(gn&4194240)===0&&(gn=64),n}function Zn(n){for(var i=[],o=0;31>o;o++)i.push(n);return i}function Un(n,i,o){n.pendingLanes|=i,i!==536870912&&(n.suspendedLanes=0,n.pingedLanes=0),n=n.eventTimes,i=31-ct(i),n[i]=o}function ya(n,i){var o=n.pendingLanes&~i;n.pendingLanes=i,n.suspendedLanes=0,n.pingedLanes=0,n.expiredLanes&=i,n.mutableReadLanes&=i,n.entangledLanes&=i,i=n.entanglements;var c=n.eventTimes;for(n=n.expirationTimes;0<o;){var f=31-ct(o),p=1<<f;i[f]=0,c[f]=-1,n[f]=-1,o&=~p}}function vc(n,i){var o=n.entangledLanes|=i;for(n=n.entanglements;o;){var c=31-ct(o),f=1<<c;f&i|n[c]&i&&(n[c]|=i),o&=~f}}var Nt=0;function Wf(n){return n&=-n,1<n?4<n?(n&268435455)!==0?16:536870912:4:1}var Xf,_c,$f,Yf,qf,yc=!1,Sa=[],rr=null,sr=null,or=null,vo=new Map,_o=new Map,ar=[],_x="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset submit".split(" ");function Zf(n,i){switch(n){case"focusin":case"focusout":rr=null;break;case"dragenter":case"dragleave":sr=null;break;case"mouseover":case"mouseout":or=null;break;case"pointerover":case"pointerout":vo.delete(i.pointerId);break;case"gotpointercapture":case"lostpointercapture":_o.delete(i.pointerId)}}function yo(n,i,o,c,f,p){return n===null||n.nativeEvent!==p?(n={blockedOn:i,domEventName:o,eventSystemFlags:c,nativeEvent:p,targetContainers:[f]},i!==null&&(i=Io(i),i!==null&&_c(i)),n):(n.eventSystemFlags|=c,i=n.targetContainers,f!==null&&i.indexOf(f)===-1&&i.push(f),n)}function yx(n,i,o,c,f){switch(i){case"focusin":return rr=yo(rr,n,i,o,c,f),!0;case"dragenter":return sr=yo(sr,n,i,o,c,f),!0;case"mouseover":return or=yo(or,n,i,o,c,f),!0;case"pointerover":var p=f.pointerId;return vo.set(p,yo(vo.get(p)||null,n,i,o,c,f)),!0;case"gotpointercapture":return p=f.pointerId,_o.set(p,yo(_o.get(p)||null,n,i,o,c,f)),!0}return!1}function Kf(n){var i=Or(n.target);if(i!==null){var o=Ei(i);if(o!==null){if(i=o.tag,i===13){if(i=va(o),i!==null){n.blockedOn=i,qf(n.priority,function(){$f(o)});return}}else if(i===3&&o.stateNode.current.memoizedState.isDehydrated){n.blockedOn=o.tag===3?o.stateNode.containerInfo:null;return}}}n.blockedOn=null}function Ma(n){if(n.blockedOn!==null)return!1;for(var i=n.targetContainers;0<i.length;){var o=Mc(n.domEventName,n.eventSystemFlags,i[0],n.nativeEvent);if(o===null){o=n.nativeEvent;var c=new o.constructor(o.type,o);Rt=c,o.target.dispatchEvent(c),Rt=null}else return i=Io(o),i!==null&&_c(i),n.blockedOn=o,!1;i.shift()}return!0}function Qf(n,i,o){Ma(n)&&o.delete(i)}function Sx(){yc=!1,rr!==null&&Ma(rr)&&(rr=null),sr!==null&&Ma(sr)&&(sr=null),or!==null&&Ma(or)&&(or=null),vo.forEach(Qf),_o.forEach(Qf)}function So(n,i){n.blockedOn===i&&(n.blockedOn=null,yc||(yc=!0,e.unstable_scheduleCallback(e.unstable_NormalPriority,Sx)))}function Mo(n){function i(f){return So(f,n)}if(0<Sa.length){So(Sa[0],n);for(var o=1;o<Sa.length;o++){var c=Sa[o];c.blockedOn===n&&(c.blockedOn=null)}}for(rr!==null&&So(rr,n),sr!==null&&So(sr,n),or!==null&&So(or,n),vo.forEach(i),_o.forEach(i),o=0;o<ar.length;o++)c=ar[o],c.blockedOn===n&&(c.blockedOn=null);for(;0<ar.length&&(o=ar[0],o.blockedOn===null);)Kf(o),o.blockedOn===null&&ar.shift()}var xs=w.ReactCurrentBatchConfig,Ea=!0;function Mx(n,i,o,c){var f=Nt,p=xs.transition;xs.transition=null;try{Nt=1,Sc(n,i,o,c)}finally{Nt=f,xs.transition=p}}function Ex(n,i,o,c){var f=Nt,p=xs.transition;xs.transition=null;try{Nt=4,Sc(n,i,o,c)}finally{Nt=f,xs.transition=p}}function Sc(n,i,o,c){if(Ea){var f=Mc(n,i,o,c);if(f===null)zc(n,i,c,wa,o),Zf(n,c);else if(yx(f,n,i,o,c))c.stopPropagation();else if(Zf(n,c),i&4&&-1<_x.indexOf(n)){for(;f!==null;){var p=Io(f);if(p!==null&&Xf(p),p=Mc(n,i,o,c),p===null&&zc(n,i,c,wa,o),p===f)break;f=p}f!==null&&c.stopPropagation()}else zc(n,i,c,null,o)}}var wa=null;function Mc(n,i,o,c){if(wa=null,n=$(c),n=Or(n),n!==null)if(i=Ei(n),i===null)n=null;else if(o=i.tag,o===13){if(n=va(i),n!==null)return n;n=null}else if(o===3){if(i.stateNode.current.memoizedState.isDehydrated)return i.tag===3?i.stateNode.containerInfo:null;n=null}else i!==n&&(n=null);return wa=n,null}function Jf(n){switch(n){case"cancel":case"click":case"close":case"contextmenu":case"copy":case"cut":case"auxclick":case"dblclick":case"dragend":case"dragstart":case"drop":case"focusin":case"focusout":case"input":case"invalid":case"keydown":case"keypress":case"keyup":case"mousedown":case"mouseup":case"paste":case"pause":case"play":case"pointercancel":case"pointerdown":case"pointerup":case"ratechange":case"reset":case"resize":case"seeked":case"submit":case"touchcancel":case"touchend":case"touchstart":case"volumechange":case"change":case"selectionchange":case"textInput":case"compositionstart":case"compositionend":case"compositionupdate":case"beforeblur":case"afterblur":case"beforeinput":case"blur":case"fullscreenchange":case"focus":case"hashchange":case"popstate":case"select":case"selectstart":return 1;case"drag":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"mousemove":case"mouseout":case"mouseover":case"pointermove":case"pointerout":case"pointerover":case"scroll":case"toggle":case"touchmove":case"wheel":case"mouseenter":case"mouseleave":case"pointerenter":case"pointerleave":return 4;case"message":switch(We()){case Ve:return 1;case rt:return 4;case ot:case Xe:return 16;case Mt:return 536870912;default:return 16}default:return 16}}var lr=null,Ec=null,Ta=null;function eh(){if(Ta)return Ta;var n,i=Ec,o=i.length,c,f="value"in lr?lr.value:lr.textContent,p=f.length;for(n=0;n<o&&i[n]===f[n];n++);var E=o-n;for(c=1;c<=E&&i[o-c]===f[p-c];c++);return Ta=f.slice(n,1<c?1-c:void 0)}function ba(n){var i=n.keyCode;return"charCode"in n?(n=n.charCode,n===0&&i===13&&(n=13)):n=i,n===10&&(n=13),32<=n||n===13?n:0}function Aa(){return!0}function th(){return!1}function Gn(n){function i(o,c,f,p,E){this._reactName=o,this._targetInst=f,this.type=c,this.nativeEvent=p,this.target=E,this.currentTarget=null;for(var k in n)n.hasOwnProperty(k)&&(o=n[k],this[k]=o?o(p):p[k]);return this.isDefaultPrevented=(p.defaultPrevented!=null?p.defaultPrevented:p.returnValue===!1)?Aa:th,this.isPropagationStopped=th,this}return q(i.prototype,{preventDefault:function(){this.defaultPrevented=!0;var o=this.nativeEvent;o&&(o.preventDefault?o.preventDefault():typeof o.returnValue!="unknown"&&(o.returnValue=!1),this.isDefaultPrevented=Aa)},stopPropagation:function(){var o=this.nativeEvent;o&&(o.stopPropagation?o.stopPropagation():typeof o.cancelBubble!="unknown"&&(o.cancelBubble=!0),this.isPropagationStopped=Aa)},persist:function(){},isPersistent:Aa}),i}var vs={eventPhase:0,bubbles:0,cancelable:0,timeStamp:function(n){return n.timeStamp||Date.now()},defaultPrevented:0,isTrusted:0},wc=Gn(vs),Eo=q({},vs,{view:0,detail:0}),wx=Gn(Eo),Tc,bc,wo,Ca=q({},Eo,{screenX:0,screenY:0,clientX:0,clientY:0,pageX:0,pageY:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,getModifierState:Cc,button:0,buttons:0,relatedTarget:function(n){return n.relatedTarget===void 0?n.fromElement===n.srcElement?n.toElement:n.fromElement:n.relatedTarget},movementX:function(n){return"movementX"in n?n.movementX:(n!==wo&&(wo&&n.type==="mousemove"?(Tc=n.screenX-wo.screenX,bc=n.screenY-wo.screenY):bc=Tc=0,wo=n),Tc)},movementY:function(n){return"movementY"in n?n.movementY:bc}}),nh=Gn(Ca),Tx=q({},Ca,{dataTransfer:0}),bx=Gn(Tx),Ax=q({},Eo,{relatedTarget:0}),Ac=Gn(Ax),Cx=q({},vs,{animationName:0,elapsedTime:0,pseudoElement:0}),Rx=Gn(Cx),Px=q({},vs,{clipboardData:function(n){return"clipboardData"in n?n.clipboardData:window.clipboardData}}),Nx=Gn(Px),Lx=q({},vs,{data:0}),ih=Gn(Lx),Dx={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},Ix={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},Ux={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Fx(n){var i=this.nativeEvent;return i.getModifierState?i.getModifierState(n):(n=Ux[n])?!!i[n]:!1}function Cc(){return Fx}var kx=q({},Eo,{key:function(n){if(n.key){var i=Dx[n.key]||n.key;if(i!=="Unidentified")return i}return n.type==="keypress"?(n=ba(n),n===13?"Enter":String.fromCharCode(n)):n.type==="keydown"||n.type==="keyup"?Ix[n.keyCode]||"Unidentified":""},code:0,location:0,ctrlKey:0,shiftKey:0,altKey:0,metaKey:0,repeat:0,locale:0,getModifierState:Cc,charCode:function(n){return n.type==="keypress"?ba(n):0},keyCode:function(n){return n.type==="keydown"||n.type==="keyup"?n.keyCode:0},which:function(n){return n.type==="keypress"?ba(n):n.type==="keydown"||n.type==="keyup"?n.keyCode:0}}),Ox=Gn(kx),zx=q({},Ca,{pointerId:0,width:0,height:0,pressure:0,tangentialPressure:0,tiltX:0,tiltY:0,twist:0,pointerType:0,isPrimary:0}),rh=Gn(zx),Bx=q({},Eo,{touches:0,targetTouches:0,changedTouches:0,altKey:0,metaKey:0,ctrlKey:0,shiftKey:0,getModifierState:Cc}),Hx=Gn(Bx),Vx=q({},vs,{propertyName:0,elapsedTime:0,pseudoElement:0}),Gx=Gn(Vx),jx=q({},Ca,{deltaX:function(n){return"deltaX"in n?n.deltaX:"wheelDeltaX"in n?-n.wheelDeltaX:0},deltaY:function(n){return"deltaY"in n?n.deltaY:"wheelDeltaY"in n?-n.wheelDeltaY:"wheelDelta"in n?-n.wheelDelta:0},deltaZ:0,deltaMode:0}),Wx=Gn(jx),Xx=[9,13,27,32],Rc=d&&"CompositionEvent"in window,To=null;d&&"documentMode"in document&&(To=document.documentMode);var $x=d&&"TextEvent"in window&&!To,sh=d&&(!Rc||To&&8<To&&11>=To),oh=" ",ah=!1;function lh(n,i){switch(n){case"keyup":return Xx.indexOf(i.keyCode)!==-1;case"keydown":return i.keyCode!==229;case"keypress":case"mousedown":case"focusout":return!0;default:return!1}}function ch(n){return n=n.detail,typeof n=="object"&&"data"in n?n.data:null}var _s=!1;function Yx(n,i){switch(n){case"compositionend":return ch(i);case"keypress":return i.which!==32?null:(ah=!0,oh);case"textInput":return n=i.data,n===oh&&ah?null:n;default:return null}}function qx(n,i){if(_s)return n==="compositionend"||!Rc&&lh(n,i)?(n=eh(),Ta=Ec=lr=null,_s=!1,n):null;switch(n){case"paste":return null;case"keypress":if(!(i.ctrlKey||i.altKey||i.metaKey)||i.ctrlKey&&i.altKey){if(i.char&&1<i.char.length)return i.char;if(i.which)return String.fromCharCode(i.which)}return null;case"compositionend":return sh&&i.locale!=="ko"?null:i.data;default:return null}}var Zx={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function uh(n){var i=n&&n.nodeName&&n.nodeName.toLowerCase();return i==="input"?!!Zx[n.type]:i==="textarea"}function dh(n,i,o,c){Le(c),i=Da(i,"onChange"),0<i.length&&(o=new wc("onChange","change",null,o,c),n.push({event:o,listeners:i}))}var bo=null,Ao=null;function Kx(n){Rh(n,0)}function Ra(n){var i=ws(n);if(Ke(i))return n}function Qx(n,i){if(n==="change")return i}var fh=!1;if(d){var Pc;if(d){var Nc="oninput"in document;if(!Nc){var hh=document.createElement("div");hh.setAttribute("oninput","return;"),Nc=typeof hh.oninput=="function"}Pc=Nc}else Pc=!1;fh=Pc&&(!document.documentMode||9<document.documentMode)}function ph(){bo&&(bo.detachEvent("onpropertychange",mh),Ao=bo=null)}function mh(n){if(n.propertyName==="value"&&Ra(Ao)){var i=[];dh(i,Ao,n,$(n)),In(Kx,i)}}function Jx(n,i,o){n==="focusin"?(ph(),bo=i,Ao=o,bo.attachEvent("onpropertychange",mh)):n==="focusout"&&ph()}function ev(n){if(n==="selectionchange"||n==="keyup"||n==="keydown")return Ra(Ao)}function tv(n,i){if(n==="click")return Ra(i)}function nv(n,i){if(n==="input"||n==="change")return Ra(i)}function iv(n,i){return n===i&&(n!==0||1/n===1/i)||n!==n&&i!==i}var ci=typeof Object.is=="function"?Object.is:iv;function Co(n,i){if(ci(n,i))return!0;if(typeof n!="object"||n===null||typeof i!="object"||i===null)return!1;var o=Object.keys(n),c=Object.keys(i);if(o.length!==c.length)return!1;for(c=0;c<o.length;c++){var f=o[c];if(!h.call(i,f)||!ci(n[f],i[f]))return!1}return!0}function gh(n){for(;n&&n.firstChild;)n=n.firstChild;return n}function xh(n,i){var o=gh(n);n=0;for(var c;o;){if(o.nodeType===3){if(c=n+o.textContent.length,n<=i&&c>=i)return{node:o,offset:i-n};n=c}e:{for(;o;){if(o.nextSibling){o=o.nextSibling;break e}o=o.parentNode}o=void 0}o=gh(o)}}function vh(n,i){return n&&i?n===i?!0:n&&n.nodeType===3?!1:i&&i.nodeType===3?vh(n,i.parentNode):"contains"in n?n.contains(i):n.compareDocumentPosition?!!(n.compareDocumentPosition(i)&16):!1:!1}function _h(){for(var n=window,i=gt();i instanceof n.HTMLIFrameElement;){try{var o=typeof i.contentWindow.location.href=="string"}catch{o=!1}if(o)n=i.contentWindow;else break;i=gt(n.document)}return i}function Lc(n){var i=n&&n.nodeName&&n.nodeName.toLowerCase();return i&&(i==="input"&&(n.type==="text"||n.type==="search"||n.type==="tel"||n.type==="url"||n.type==="password")||i==="textarea"||n.contentEditable==="true")}function rv(n){var i=_h(),o=n.focusedElem,c=n.selectionRange;if(i!==o&&o&&o.ownerDocument&&vh(o.ownerDocument.documentElement,o)){if(c!==null&&Lc(o)){if(i=c.start,n=c.end,n===void 0&&(n=i),"selectionStart"in o)o.selectionStart=i,o.selectionEnd=Math.min(n,o.value.length);else if(n=(i=o.ownerDocument||document)&&i.defaultView||window,n.getSelection){n=n.getSelection();var f=o.textContent.length,p=Math.min(c.start,f);c=c.end===void 0?p:Math.min(c.end,f),!n.extend&&p>c&&(f=c,c=p,p=f),f=xh(o,p);var E=xh(o,c);f&&E&&(n.rangeCount!==1||n.anchorNode!==f.node||n.anchorOffset!==f.offset||n.focusNode!==E.node||n.focusOffset!==E.offset)&&(i=i.createRange(),i.setStart(f.node,f.offset),n.removeAllRanges(),p>c?(n.addRange(i),n.extend(E.node,E.offset)):(i.setEnd(E.node,E.offset),n.addRange(i)))}}for(i=[],n=o;n=n.parentNode;)n.nodeType===1&&i.push({element:n,left:n.scrollLeft,top:n.scrollTop});for(typeof o.focus=="function"&&o.focus(),o=0;o<i.length;o++)n=i[o],n.element.scrollLeft=n.left,n.element.scrollTop=n.top}}var sv=d&&"documentMode"in document&&11>=document.documentMode,ys=null,Dc=null,Ro=null,Ic=!1;function yh(n,i,o){var c=o.window===o?o.document:o.nodeType===9?o:o.ownerDocument;Ic||ys==null||ys!==gt(c)||(c=ys,"selectionStart"in c&&Lc(c)?c={start:c.selectionStart,end:c.selectionEnd}:(c=(c.ownerDocument&&c.ownerDocument.defaultView||window).getSelection(),c={anchorNode:c.anchorNode,anchorOffset:c.anchorOffset,focusNode:c.focusNode,focusOffset:c.focusOffset}),Ro&&Co(Ro,c)||(Ro=c,c=Da(Dc,"onSelect"),0<c.length&&(i=new wc("onSelect","select",null,i,o),n.push({event:i,listeners:c}),i.target=ys)))}function Pa(n,i){var o={};return o[n.toLowerCase()]=i.toLowerCase(),o["Webkit"+n]="webkit"+i,o["Moz"+n]="moz"+i,o}var Ss={animationend:Pa("Animation","AnimationEnd"),animationiteration:Pa("Animation","AnimationIteration"),animationstart:Pa("Animation","AnimationStart"),transitionend:Pa("Transition","TransitionEnd")},Uc={},Sh={};d&&(Sh=document.createElement("div").style,"AnimationEvent"in window||(delete Ss.animationend.animation,delete Ss.animationiteration.animation,delete Ss.animationstart.animation),"TransitionEvent"in window||delete Ss.transitionend.transition);function Na(n){if(Uc[n])return Uc[n];if(!Ss[n])return n;var i=Ss[n],o;for(o in i)if(i.hasOwnProperty(o)&&o in Sh)return Uc[n]=i[o];return n}var Mh=Na("animationend"),Eh=Na("animationiteration"),wh=Na("animationstart"),Th=Na("transitionend"),bh=new Map,Ah="abort auxClick cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");function cr(n,i){bh.set(n,i),l(i,[n])}for(var Fc=0;Fc<Ah.length;Fc++){var kc=Ah[Fc],ov=kc.toLowerCase(),av=kc[0].toUpperCase()+kc.slice(1);cr(ov,"on"+av)}cr(Mh,"onAnimationEnd"),cr(Eh,"onAnimationIteration"),cr(wh,"onAnimationStart"),cr("dblclick","onDoubleClick"),cr("focusin","onFocus"),cr("focusout","onBlur"),cr(Th,"onTransitionEnd"),u("onMouseEnter",["mouseout","mouseover"]),u("onMouseLeave",["mouseout","mouseover"]),u("onPointerEnter",["pointerout","pointerover"]),u("onPointerLeave",["pointerout","pointerover"]),l("onChange","change click focusin focusout input keydown keyup selectionchange".split(" ")),l("onSelect","focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")),l("onBeforeInput",["compositionend","keypress","textInput","paste"]),l("onCompositionEnd","compositionend focusout keydown keypress keyup mousedown".split(" ")),l("onCompositionStart","compositionstart focusout keydown keypress keyup mousedown".split(" ")),l("onCompositionUpdate","compositionupdate focusout keydown keypress keyup mousedown".split(" "));var Po="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),lv=new Set("cancel close invalid load scroll toggle".split(" ").concat(Po));function Ch(n,i,o){var c=n.type||"unknown-event";n.currentTarget=o,xa(c,i,void 0,n),n.currentTarget=null}function Rh(n,i){i=(i&4)!==0;for(var o=0;o<n.length;o++){var c=n[o],f=c.event;c=c.listeners;e:{var p=void 0;if(i)for(var E=c.length-1;0<=E;E--){var k=c[E],G=k.instance,ae=k.currentTarget;if(k=k.listener,G!==p&&f.isPropagationStopped())break e;Ch(f,k,ae),p=G}else for(E=0;E<c.length;E++){if(k=c[E],G=k.instance,ae=k.currentTarget,k=k.listener,G!==p&&f.isPropagationStopped())break e;Ch(f,k,ae),p=G}}}if(kr)throw n=ir,kr=!1,ir=null,n}function zt(n,i){var o=i[Wc];o===void 0&&(o=i[Wc]=new Set);var c=n+"__bubble";o.has(c)||(Ph(i,n,2,!1),o.add(c))}function Oc(n,i,o){var c=0;i&&(c|=4),Ph(o,n,c,i)}var La="_reactListening"+Math.random().toString(36).slice(2);function No(n){if(!n[La]){n[La]=!0,r.forEach(function(o){o!=="selectionchange"&&(lv.has(o)||Oc(o,!1,n),Oc(o,!0,n))});var i=n.nodeType===9?n:n.ownerDocument;i===null||i[La]||(i[La]=!0,Oc("selectionchange",!1,i))}}function Ph(n,i,o,c){switch(Jf(i)){case 1:var f=Mx;break;case 4:f=Ex;break;default:f=Sc}o=f.bind(null,i,o,n),f=void 0,!ms||i!=="touchstart"&&i!=="touchmove"&&i!=="wheel"||(f=!0),c?f!==void 0?n.addEventListener(i,o,{capture:!0,passive:f}):n.addEventListener(i,o,!0):f!==void 0?n.addEventListener(i,o,{passive:f}):n.addEventListener(i,o,!1)}function zc(n,i,o,c,f){var p=c;if((i&1)===0&&(i&2)===0&&c!==null)e:for(;;){if(c===null)return;var E=c.tag;if(E===3||E===4){var k=c.stateNode.containerInfo;if(k===f||k.nodeType===8&&k.parentNode===f)break;if(E===4)for(E=c.return;E!==null;){var G=E.tag;if((G===3||G===4)&&(G=E.stateNode.containerInfo,G===f||G.nodeType===8&&G.parentNode===f))return;E=E.return}for(;k!==null;){if(E=Or(k),E===null)return;if(G=E.tag,G===5||G===6){c=p=E;continue e}k=k.parentNode}}c=c.return}In(function(){var ae=p,_e=$(o),ye=[];e:{var ge=bh.get(n);if(ge!==void 0){var Ue=wc,He=n;switch(n){case"keypress":if(ba(o)===0)break e;case"keydown":case"keyup":Ue=Ox;break;case"focusin":He="focus",Ue=Ac;break;case"focusout":He="blur",Ue=Ac;break;case"beforeblur":case"afterblur":Ue=Ac;break;case"click":if(o.button===2)break e;case"auxclick":case"dblclick":case"mousedown":case"mousemove":case"mouseup":case"mouseout":case"mouseover":case"contextmenu":Ue=nh;break;case"drag":case"dragend":case"dragenter":case"dragexit":case"dragleave":case"dragover":case"dragstart":case"drop":Ue=bx;break;case"touchcancel":case"touchend":case"touchmove":case"touchstart":Ue=Hx;break;case Mh:case Eh:case wh:Ue=Rx;break;case Th:Ue=Gx;break;case"scroll":Ue=wx;break;case"wheel":Ue=Wx;break;case"copy":case"cut":case"paste":Ue=Nx;break;case"gotpointercapture":case"lostpointercapture":case"pointercancel":case"pointerdown":case"pointermove":case"pointerout":case"pointerover":case"pointerup":Ue=rh}var Ge=(i&4)!==0,Zt=!Ge&&n==="scroll",ee=Ge?ge!==null?ge+"Capture":null:ge;Ge=[];for(var W=ae,re;W!==null;){re=W;var we=re.stateNode;if(re.tag===5&&we!==null&&(re=we,ee!==null&&(we=Tn(W,ee),we!=null&&Ge.push(Lo(W,we,re)))),Zt)break;W=W.return}0<Ge.length&&(ge=new Ue(ge,He,null,o,_e),ye.push({event:ge,listeners:Ge}))}}if((i&7)===0){e:{if(ge=n==="mouseover"||n==="pointerover",Ue=n==="mouseout"||n==="pointerout",ge&&o!==Rt&&(He=o.relatedTarget||o.fromElement)&&(Or(He)||He[Fi]))break e;if((Ue||ge)&&(ge=_e.window===_e?_e:(ge=_e.ownerDocument)?ge.defaultView||ge.parentWindow:window,Ue?(He=o.relatedTarget||o.toElement,Ue=ae,He=He?Or(He):null,He!==null&&(Zt=Ei(He),He!==Zt||He.tag!==5&&He.tag!==6)&&(He=null)):(Ue=null,He=ae),Ue!==He)){if(Ge=nh,we="onMouseLeave",ee="onMouseEnter",W="mouse",(n==="pointerout"||n==="pointerover")&&(Ge=rh,we="onPointerLeave",ee="onPointerEnter",W="pointer"),Zt=Ue==null?ge:ws(Ue),re=He==null?ge:ws(He),ge=new Ge(we,W+"leave",Ue,o,_e),ge.target=Zt,ge.relatedTarget=re,we=null,Or(_e)===ae&&(Ge=new Ge(ee,W+"enter",He,o,_e),Ge.target=re,Ge.relatedTarget=Zt,we=Ge),Zt=we,Ue&&He)t:{for(Ge=Ue,ee=He,W=0,re=Ge;re;re=Ms(re))W++;for(re=0,we=ee;we;we=Ms(we))re++;for(;0<W-re;)Ge=Ms(Ge),W--;for(;0<re-W;)ee=Ms(ee),re--;for(;W--;){if(Ge===ee||ee!==null&&Ge===ee.alternate)break t;Ge=Ms(Ge),ee=Ms(ee)}Ge=null}else Ge=null;Ue!==null&&Nh(ye,ge,Ue,Ge,!1),He!==null&&Zt!==null&&Nh(ye,Zt,He,Ge,!0)}}e:{if(ge=ae?ws(ae):window,Ue=ge.nodeName&&ge.nodeName.toLowerCase(),Ue==="select"||Ue==="input"&&ge.type==="file")var $e=Qx;else if(uh(ge))if(fh)$e=nv;else{$e=ev;var Je=Jx}else(Ue=ge.nodeName)&&Ue.toLowerCase()==="input"&&(ge.type==="checkbox"||ge.type==="radio")&&($e=tv);if($e&&($e=$e(n,ae))){dh(ye,$e,o,_e);break e}Je&&Je(n,ge,ae),n==="focusout"&&(Je=ge._wrapperState)&&Je.controlled&&ge.type==="number"&&Pt(ge,"number",ge.value)}switch(Je=ae?ws(ae):window,n){case"focusin":(uh(Je)||Je.contentEditable==="true")&&(ys=Je,Dc=ae,Ro=null);break;case"focusout":Ro=Dc=ys=null;break;case"mousedown":Ic=!0;break;case"contextmenu":case"mouseup":case"dragend":Ic=!1,yh(ye,o,_e);break;case"selectionchange":if(sv)break;case"keydown":case"keyup":yh(ye,o,_e)}var et;if(Rc)e:{switch(n){case"compositionstart":var st="onCompositionStart";break e;case"compositionend":st="onCompositionEnd";break e;case"compositionupdate":st="onCompositionUpdate";break e}st=void 0}else _s?lh(n,o)&&(st="onCompositionEnd"):n==="keydown"&&o.keyCode===229&&(st="onCompositionStart");st&&(sh&&o.locale!=="ko"&&(_s||st!=="onCompositionStart"?st==="onCompositionEnd"&&_s&&(et=eh()):(lr=_e,Ec="value"in lr?lr.value:lr.textContent,_s=!0)),Je=Da(ae,st),0<Je.length&&(st=new ih(st,n,null,o,_e),ye.push({event:st,listeners:Je}),et?st.data=et:(et=ch(o),et!==null&&(st.data=et)))),(et=$x?Yx(n,o):qx(n,o))&&(ae=Da(ae,"onBeforeInput"),0<ae.length&&(_e=new ih("onBeforeInput","beforeinput",null,o,_e),ye.push({event:_e,listeners:ae}),_e.data=et))}Rh(ye,i)})}function Lo(n,i,o){return{instance:n,listener:i,currentTarget:o}}function Da(n,i){for(var o=i+"Capture",c=[];n!==null;){var f=n,p=f.stateNode;f.tag===5&&p!==null&&(f=p,p=Tn(n,o),p!=null&&c.unshift(Lo(n,p,f)),p=Tn(n,i),p!=null&&c.push(Lo(n,p,f))),n=n.return}return c}function Ms(n){if(n===null)return null;do n=n.return;while(n&&n.tag!==5);return n||null}function Nh(n,i,o,c,f){for(var p=i._reactName,E=[];o!==null&&o!==c;){var k=o,G=k.alternate,ae=k.stateNode;if(G!==null&&G===c)break;k.tag===5&&ae!==null&&(k=ae,f?(G=Tn(o,p),G!=null&&E.unshift(Lo(o,G,k))):f||(G=Tn(o,p),G!=null&&E.push(Lo(o,G,k)))),o=o.return}E.length!==0&&n.push({event:i,listeners:E})}var cv=/\r\n?/g,uv=/\u0000|\uFFFD/g;function Lh(n){return(typeof n=="string"?n:""+n).replace(cv,`
`).replace(uv,"")}function Ia(n,i,o){if(i=Lh(i),Lh(n)!==i&&o)throw Error(t(425))}function Ua(){}var Bc=null,Hc=null;function Vc(n,i){return n==="textarea"||n==="noscript"||typeof i.children=="string"||typeof i.children=="number"||typeof i.dangerouslySetInnerHTML=="object"&&i.dangerouslySetInnerHTML!==null&&i.dangerouslySetInnerHTML.__html!=null}var Gc=typeof setTimeout=="function"?setTimeout:void 0,dv=typeof clearTimeout=="function"?clearTimeout:void 0,Dh=typeof Promise=="function"?Promise:void 0,fv=typeof queueMicrotask=="function"?queueMicrotask:typeof Dh<"u"?function(n){return Dh.resolve(null).then(n).catch(hv)}:Gc;function hv(n){setTimeout(function(){throw n})}function jc(n,i){var o=i,c=0;do{var f=o.nextSibling;if(n.removeChild(o),f&&f.nodeType===8)if(o=f.data,o==="/$"){if(c===0){n.removeChild(f),Mo(i);return}c--}else o!=="$"&&o!=="$?"&&o!=="$!"||c++;o=f}while(o);Mo(i)}function ur(n){for(;n!=null;n=n.nextSibling){var i=n.nodeType;if(i===1||i===3)break;if(i===8){if(i=n.data,i==="$"||i==="$!"||i==="$?")break;if(i==="/$")return null}}return n}function Ih(n){n=n.previousSibling;for(var i=0;n;){if(n.nodeType===8){var o=n.data;if(o==="$"||o==="$!"||o==="$?"){if(i===0)return n;i--}else o==="/$"&&i++}n=n.previousSibling}return null}var Es=Math.random().toString(36).slice(2),Ti="__reactFiber$"+Es,Do="__reactProps$"+Es,Fi="__reactContainer$"+Es,Wc="__reactEvents$"+Es,pv="__reactListeners$"+Es,mv="__reactHandles$"+Es;function Or(n){var i=n[Ti];if(i)return i;for(var o=n.parentNode;o;){if(i=o[Fi]||o[Ti]){if(o=i.alternate,i.child!==null||o!==null&&o.child!==null)for(n=Ih(n);n!==null;){if(o=n[Ti])return o;n=Ih(n)}return i}n=o,o=n.parentNode}return null}function Io(n){return n=n[Ti]||n[Fi],!n||n.tag!==5&&n.tag!==6&&n.tag!==13&&n.tag!==3?null:n}function ws(n){if(n.tag===5||n.tag===6)return n.stateNode;throw Error(t(33))}function Fa(n){return n[Do]||null}var Xc=[],Ts=-1;function dr(n){return{current:n}}function Bt(n){0>Ts||(n.current=Xc[Ts],Xc[Ts]=null,Ts--)}function kt(n,i){Ts++,Xc[Ts]=n.current,n.current=i}var fr={},xn=dr(fr),Fn=dr(!1),zr=fr;function bs(n,i){var o=n.type.contextTypes;if(!o)return fr;var c=n.stateNode;if(c&&c.__reactInternalMemoizedUnmaskedChildContext===i)return c.__reactInternalMemoizedMaskedChildContext;var f={},p;for(p in o)f[p]=i[p];return c&&(n=n.stateNode,n.__reactInternalMemoizedUnmaskedChildContext=i,n.__reactInternalMemoizedMaskedChildContext=f),f}function kn(n){return n=n.childContextTypes,n!=null}function ka(){Bt(Fn),Bt(xn)}function Uh(n,i,o){if(xn.current!==fr)throw Error(t(168));kt(xn,i),kt(Fn,o)}function Fh(n,i,o){var c=n.stateNode;if(i=i.childContextTypes,typeof c.getChildContext!="function")return o;c=c.getChildContext();for(var f in c)if(!(f in i))throw Error(t(108,xe(n)||"Unknown",f));return q({},o,c)}function Oa(n){return n=(n=n.stateNode)&&n.__reactInternalMemoizedMergedChildContext||fr,zr=xn.current,kt(xn,n),kt(Fn,Fn.current),!0}function kh(n,i,o){var c=n.stateNode;if(!c)throw Error(t(169));o?(n=Fh(n,i,zr),c.__reactInternalMemoizedMergedChildContext=n,Bt(Fn),Bt(xn),kt(xn,n)):Bt(Fn),kt(Fn,o)}var ki=null,za=!1,$c=!1;function Oh(n){ki===null?ki=[n]:ki.push(n)}function gv(n){za=!0,Oh(n)}function hr(){if(!$c&&ki!==null){$c=!0;var n=0,i=Nt;try{var o=ki;for(Nt=1;n<o.length;n++){var c=o[n];do c=c(!0);while(c!==null)}ki=null,za=!1}catch(f){throw ki!==null&&(ki=ki.slice(n+1)),le(Ve,hr),f}finally{Nt=i,$c=!1}}return null}var As=[],Cs=0,Ba=null,Ha=0,Kn=[],Qn=0,Br=null,Oi=1,zi="";function Hr(n,i){As[Cs++]=Ha,As[Cs++]=Ba,Ba=n,Ha=i}function zh(n,i,o){Kn[Qn++]=Oi,Kn[Qn++]=zi,Kn[Qn++]=Br,Br=n;var c=Oi;n=zi;var f=32-ct(c)-1;c&=~(1<<f),o+=1;var p=32-ct(i)+f;if(30<p){var E=f-f%5;p=(c&(1<<E)-1).toString(32),c>>=E,f-=E,Oi=1<<32-ct(i)+f|o<<f|c,zi=p+n}else Oi=1<<p|o<<f|c,zi=n}function Yc(n){n.return!==null&&(Hr(n,1),zh(n,1,0))}function qc(n){for(;n===Ba;)Ba=As[--Cs],As[Cs]=null,Ha=As[--Cs],As[Cs]=null;for(;n===Br;)Br=Kn[--Qn],Kn[Qn]=null,zi=Kn[--Qn],Kn[Qn]=null,Oi=Kn[--Qn],Kn[Qn]=null}var jn=null,Wn=null,Vt=!1,ui=null;function Bh(n,i){var o=ni(5,null,null,0);o.elementType="DELETED",o.stateNode=i,o.return=n,i=n.deletions,i===null?(n.deletions=[o],n.flags|=16):i.push(o)}function Hh(n,i){switch(n.tag){case 5:var o=n.type;return i=i.nodeType!==1||o.toLowerCase()!==i.nodeName.toLowerCase()?null:i,i!==null?(n.stateNode=i,jn=n,Wn=ur(i.firstChild),!0):!1;case 6:return i=n.pendingProps===""||i.nodeType!==3?null:i,i!==null?(n.stateNode=i,jn=n,Wn=null,!0):!1;case 13:return i=i.nodeType!==8?null:i,i!==null?(o=Br!==null?{id:Oi,overflow:zi}:null,n.memoizedState={dehydrated:i,treeContext:o,retryLane:1073741824},o=ni(18,null,null,0),o.stateNode=i,o.return=n,n.child=o,jn=n,Wn=null,!0):!1;default:return!1}}function Zc(n){return(n.mode&1)!==0&&(n.flags&128)===0}function Kc(n){if(Vt){var i=Wn;if(i){var o=i;if(!Hh(n,i)){if(Zc(n))throw Error(t(418));i=ur(o.nextSibling);var c=jn;i&&Hh(n,i)?Bh(c,o):(n.flags=n.flags&-4097|2,Vt=!1,jn=n)}}else{if(Zc(n))throw Error(t(418));n.flags=n.flags&-4097|2,Vt=!1,jn=n}}}function Vh(n){for(n=n.return;n!==null&&n.tag!==5&&n.tag!==3&&n.tag!==13;)n=n.return;jn=n}function Va(n){if(n!==jn)return!1;if(!Vt)return Vh(n),Vt=!0,!1;var i;if((i=n.tag!==3)&&!(i=n.tag!==5)&&(i=n.type,i=i!=="head"&&i!=="body"&&!Vc(n.type,n.memoizedProps)),i&&(i=Wn)){if(Zc(n))throw Gh(),Error(t(418));for(;i;)Bh(n,i),i=ur(i.nextSibling)}if(Vh(n),n.tag===13){if(n=n.memoizedState,n=n!==null?n.dehydrated:null,!n)throw Error(t(317));e:{for(n=n.nextSibling,i=0;n;){if(n.nodeType===8){var o=n.data;if(o==="/$"){if(i===0){Wn=ur(n.nextSibling);break e}i--}else o!=="$"&&o!=="$!"&&o!=="$?"||i++}n=n.nextSibling}Wn=null}}else Wn=jn?ur(n.stateNode.nextSibling):null;return!0}function Gh(){for(var n=Wn;n;)n=ur(n.nextSibling)}function Rs(){Wn=jn=null,Vt=!1}function Qc(n){ui===null?ui=[n]:ui.push(n)}var xv=w.ReactCurrentBatchConfig;function Uo(n,i,o){if(n=o.ref,n!==null&&typeof n!="function"&&typeof n!="object"){if(o._owner){if(o=o._owner,o){if(o.tag!==1)throw Error(t(309));var c=o.stateNode}if(!c)throw Error(t(147,n));var f=c,p=""+n;return i!==null&&i.ref!==null&&typeof i.ref=="function"&&i.ref._stringRef===p?i.ref:(i=function(E){var k=f.refs;E===null?delete k[p]:k[p]=E},i._stringRef=p,i)}if(typeof n!="string")throw Error(t(284));if(!o._owner)throw Error(t(290,n))}return n}function Ga(n,i){throw n=Object.prototype.toString.call(i),Error(t(31,n==="[object Object]"?"object with keys {"+Object.keys(i).join(", ")+"}":n))}function jh(n){var i=n._init;return i(n._payload)}function Wh(n){function i(ee,W){if(n){var re=ee.deletions;re===null?(ee.deletions=[W],ee.flags|=16):re.push(W)}}function o(ee,W){if(!n)return null;for(;W!==null;)i(ee,W),W=W.sibling;return null}function c(ee,W){for(ee=new Map;W!==null;)W.key!==null?ee.set(W.key,W):ee.set(W.index,W),W=W.sibling;return ee}function f(ee,W){return ee=Sr(ee,W),ee.index=0,ee.sibling=null,ee}function p(ee,W,re){return ee.index=re,n?(re=ee.alternate,re!==null?(re=re.index,re<W?(ee.flags|=2,W):re):(ee.flags|=2,W)):(ee.flags|=1048576,W)}function E(ee){return n&&ee.alternate===null&&(ee.flags|=2),ee}function k(ee,W,re,we){return W===null||W.tag!==6?(W=Gu(re,ee.mode,we),W.return=ee,W):(W=f(W,re),W.return=ee,W)}function G(ee,W,re,we){var $e=re.type;return $e===F?_e(ee,W,re.props.children,we,re.key):W!==null&&(W.elementType===$e||typeof $e=="object"&&$e!==null&&$e.$$typeof===j&&jh($e)===W.type)?(we=f(W,re.props),we.ref=Uo(ee,W,re),we.return=ee,we):(we=hl(re.type,re.key,re.props,null,ee.mode,we),we.ref=Uo(ee,W,re),we.return=ee,we)}function ae(ee,W,re,we){return W===null||W.tag!==4||W.stateNode.containerInfo!==re.containerInfo||W.stateNode.implementation!==re.implementation?(W=ju(re,ee.mode,we),W.return=ee,W):(W=f(W,re.children||[]),W.return=ee,W)}function _e(ee,W,re,we,$e){return W===null||W.tag!==7?(W=qr(re,ee.mode,we,$e),W.return=ee,W):(W=f(W,re),W.return=ee,W)}function ye(ee,W,re){if(typeof W=="string"&&W!==""||typeof W=="number")return W=Gu(""+W,ee.mode,re),W.return=ee,W;if(typeof W=="object"&&W!==null){switch(W.$$typeof){case O:return re=hl(W.type,W.key,W.props,null,ee.mode,re),re.ref=Uo(ee,null,W),re.return=ee,re;case D:return W=ju(W,ee.mode,re),W.return=ee,W;case j:var we=W._init;return ye(ee,we(W._payload),re)}if(qe(W)||X(W))return W=qr(W,ee.mode,re,null),W.return=ee,W;Ga(ee,W)}return null}function ge(ee,W,re,we){var $e=W!==null?W.key:null;if(typeof re=="string"&&re!==""||typeof re=="number")return $e!==null?null:k(ee,W,""+re,we);if(typeof re=="object"&&re!==null){switch(re.$$typeof){case O:return re.key===$e?G(ee,W,re,we):null;case D:return re.key===$e?ae(ee,W,re,we):null;case j:return $e=re._init,ge(ee,W,$e(re._payload),we)}if(qe(re)||X(re))return $e!==null?null:_e(ee,W,re,we,null);Ga(ee,re)}return null}function Ue(ee,W,re,we,$e){if(typeof we=="string"&&we!==""||typeof we=="number")return ee=ee.get(re)||null,k(W,ee,""+we,$e);if(typeof we=="object"&&we!==null){switch(we.$$typeof){case O:return ee=ee.get(we.key===null?re:we.key)||null,G(W,ee,we,$e);case D:return ee=ee.get(we.key===null?re:we.key)||null,ae(W,ee,we,$e);case j:var Je=we._init;return Ue(ee,W,re,Je(we._payload),$e)}if(qe(we)||X(we))return ee=ee.get(re)||null,_e(W,ee,we,$e,null);Ga(W,we)}return null}function He(ee,W,re,we){for(var $e=null,Je=null,et=W,st=W=0,cn=null;et!==null&&st<re.length;st++){et.index>st?(cn=et,et=null):cn=et.sibling;var At=ge(ee,et,re[st],we);if(At===null){et===null&&(et=cn);break}n&&et&&At.alternate===null&&i(ee,et),W=p(At,W,st),Je===null?$e=At:Je.sibling=At,Je=At,et=cn}if(st===re.length)return o(ee,et),Vt&&Hr(ee,st),$e;if(et===null){for(;st<re.length;st++)et=ye(ee,re[st],we),et!==null&&(W=p(et,W,st),Je===null?$e=et:Je.sibling=et,Je=et);return Vt&&Hr(ee,st),$e}for(et=c(ee,et);st<re.length;st++)cn=Ue(et,ee,st,re[st],we),cn!==null&&(n&&cn.alternate!==null&&et.delete(cn.key===null?st:cn.key),W=p(cn,W,st),Je===null?$e=cn:Je.sibling=cn,Je=cn);return n&&et.forEach(function(Mr){return i(ee,Mr)}),Vt&&Hr(ee,st),$e}function Ge(ee,W,re,we){var $e=X(re);if(typeof $e!="function")throw Error(t(150));if(re=$e.call(re),re==null)throw Error(t(151));for(var Je=$e=null,et=W,st=W=0,cn=null,At=re.next();et!==null&&!At.done;st++,At=re.next()){et.index>st?(cn=et,et=null):cn=et.sibling;var Mr=ge(ee,et,At.value,we);if(Mr===null){et===null&&(et=cn);break}n&&et&&Mr.alternate===null&&i(ee,et),W=p(Mr,W,st),Je===null?$e=Mr:Je.sibling=Mr,Je=Mr,et=cn}if(At.done)return o(ee,et),Vt&&Hr(ee,st),$e;if(et===null){for(;!At.done;st++,At=re.next())At=ye(ee,At.value,we),At!==null&&(W=p(At,W,st),Je===null?$e=At:Je.sibling=At,Je=At);return Vt&&Hr(ee,st),$e}for(et=c(ee,et);!At.done;st++,At=re.next())At=Ue(et,ee,st,At.value,we),At!==null&&(n&&At.alternate!==null&&et.delete(At.key===null?st:At.key),W=p(At,W,st),Je===null?$e=At:Je.sibling=At,Je=At);return n&&et.forEach(function(Zv){return i(ee,Zv)}),Vt&&Hr(ee,st),$e}function Zt(ee,W,re,we){if(typeof re=="object"&&re!==null&&re.type===F&&re.key===null&&(re=re.props.children),typeof re=="object"&&re!==null){switch(re.$$typeof){case O:e:{for(var $e=re.key,Je=W;Je!==null;){if(Je.key===$e){if($e=re.type,$e===F){if(Je.tag===7){o(ee,Je.sibling),W=f(Je,re.props.children),W.return=ee,ee=W;break e}}else if(Je.elementType===$e||typeof $e=="object"&&$e!==null&&$e.$$typeof===j&&jh($e)===Je.type){o(ee,Je.sibling),W=f(Je,re.props),W.ref=Uo(ee,Je,re),W.return=ee,ee=W;break e}o(ee,Je);break}else i(ee,Je);Je=Je.sibling}re.type===F?(W=qr(re.props.children,ee.mode,we,re.key),W.return=ee,ee=W):(we=hl(re.type,re.key,re.props,null,ee.mode,we),we.ref=Uo(ee,W,re),we.return=ee,ee=we)}return E(ee);case D:e:{for(Je=re.key;W!==null;){if(W.key===Je)if(W.tag===4&&W.stateNode.containerInfo===re.containerInfo&&W.stateNode.implementation===re.implementation){o(ee,W.sibling),W=f(W,re.children||[]),W.return=ee,ee=W;break e}else{o(ee,W);break}else i(ee,W);W=W.sibling}W=ju(re,ee.mode,we),W.return=ee,ee=W}return E(ee);case j:return Je=re._init,Zt(ee,W,Je(re._payload),we)}if(qe(re))return He(ee,W,re,we);if(X(re))return Ge(ee,W,re,we);Ga(ee,re)}return typeof re=="string"&&re!==""||typeof re=="number"?(re=""+re,W!==null&&W.tag===6?(o(ee,W.sibling),W=f(W,re),W.return=ee,ee=W):(o(ee,W),W=Gu(re,ee.mode,we),W.return=ee,ee=W),E(ee)):o(ee,W)}return Zt}var Ps=Wh(!0),Xh=Wh(!1),ja=dr(null),Wa=null,Ns=null,Jc=null;function eu(){Jc=Ns=Wa=null}function tu(n){var i=ja.current;Bt(ja),n._currentValue=i}function nu(n,i,o){for(;n!==null;){var c=n.alternate;if((n.childLanes&i)!==i?(n.childLanes|=i,c!==null&&(c.childLanes|=i)):c!==null&&(c.childLanes&i)!==i&&(c.childLanes|=i),n===o)break;n=n.return}}function Ls(n,i){Wa=n,Jc=Ns=null,n=n.dependencies,n!==null&&n.firstContext!==null&&((n.lanes&i)!==0&&(On=!0),n.firstContext=null)}function Jn(n){var i=n._currentValue;if(Jc!==n)if(n={context:n,memoizedValue:i,next:null},Ns===null){if(Wa===null)throw Error(t(308));Ns=n,Wa.dependencies={lanes:0,firstContext:n}}else Ns=Ns.next=n;return i}var Vr=null;function iu(n){Vr===null?Vr=[n]:Vr.push(n)}function $h(n,i,o,c){var f=i.interleaved;return f===null?(o.next=o,iu(i)):(o.next=f.next,f.next=o),i.interleaved=o,Bi(n,c)}function Bi(n,i){n.lanes|=i;var o=n.alternate;for(o!==null&&(o.lanes|=i),o=n,n=n.return;n!==null;)n.childLanes|=i,o=n.alternate,o!==null&&(o.childLanes|=i),o=n,n=n.return;return o.tag===3?o.stateNode:null}var pr=!1;function ru(n){n.updateQueue={baseState:n.memoizedState,firstBaseUpdate:null,lastBaseUpdate:null,shared:{pending:null,interleaved:null,lanes:0},effects:null}}function Yh(n,i){n=n.updateQueue,i.updateQueue===n&&(i.updateQueue={baseState:n.baseState,firstBaseUpdate:n.firstBaseUpdate,lastBaseUpdate:n.lastBaseUpdate,shared:n.shared,effects:n.effects})}function Hi(n,i){return{eventTime:n,lane:i,tag:0,payload:null,callback:null,next:null}}function mr(n,i,o){var c=n.updateQueue;if(c===null)return null;if(c=c.shared,(wt&2)!==0){var f=c.pending;return f===null?i.next=i:(i.next=f.next,f.next=i),c.pending=i,Bi(n,o)}return f=c.interleaved,f===null?(i.next=i,iu(c)):(i.next=f.next,f.next=i),c.interleaved=i,Bi(n,o)}function Xa(n,i,o){if(i=i.updateQueue,i!==null&&(i=i.shared,(o&4194240)!==0)){var c=i.lanes;c&=n.pendingLanes,o|=c,i.lanes=o,vc(n,o)}}function qh(n,i){var o=n.updateQueue,c=n.alternate;if(c!==null&&(c=c.updateQueue,o===c)){var f=null,p=null;if(o=o.firstBaseUpdate,o!==null){do{var E={eventTime:o.eventTime,lane:o.lane,tag:o.tag,payload:o.payload,callback:o.callback,next:null};p===null?f=p=E:p=p.next=E,o=o.next}while(o!==null);p===null?f=p=i:p=p.next=i}else f=p=i;o={baseState:c.baseState,firstBaseUpdate:f,lastBaseUpdate:p,shared:c.shared,effects:c.effects},n.updateQueue=o;return}n=o.lastBaseUpdate,n===null?o.firstBaseUpdate=i:n.next=i,o.lastBaseUpdate=i}function $a(n,i,o,c){var f=n.updateQueue;pr=!1;var p=f.firstBaseUpdate,E=f.lastBaseUpdate,k=f.shared.pending;if(k!==null){f.shared.pending=null;var G=k,ae=G.next;G.next=null,E===null?p=ae:E.next=ae,E=G;var _e=n.alternate;_e!==null&&(_e=_e.updateQueue,k=_e.lastBaseUpdate,k!==E&&(k===null?_e.firstBaseUpdate=ae:k.next=ae,_e.lastBaseUpdate=G))}if(p!==null){var ye=f.baseState;E=0,_e=ae=G=null,k=p;do{var ge=k.lane,Ue=k.eventTime;if((c&ge)===ge){_e!==null&&(_e=_e.next={eventTime:Ue,lane:0,tag:k.tag,payload:k.payload,callback:k.callback,next:null});e:{var He=n,Ge=k;switch(ge=i,Ue=o,Ge.tag){case 1:if(He=Ge.payload,typeof He=="function"){ye=He.call(Ue,ye,ge);break e}ye=He;break e;case 3:He.flags=He.flags&-65537|128;case 0:if(He=Ge.payload,ge=typeof He=="function"?He.call(Ue,ye,ge):He,ge==null)break e;ye=q({},ye,ge);break e;case 2:pr=!0}}k.callback!==null&&k.lane!==0&&(n.flags|=64,ge=f.effects,ge===null?f.effects=[k]:ge.push(k))}else Ue={eventTime:Ue,lane:ge,tag:k.tag,payload:k.payload,callback:k.callback,next:null},_e===null?(ae=_e=Ue,G=ye):_e=_e.next=Ue,E|=ge;if(k=k.next,k===null){if(k=f.shared.pending,k===null)break;ge=k,k=ge.next,ge.next=null,f.lastBaseUpdate=ge,f.shared.pending=null}}while(!0);if(_e===null&&(G=ye),f.baseState=G,f.firstBaseUpdate=ae,f.lastBaseUpdate=_e,i=f.shared.interleaved,i!==null){f=i;do E|=f.lane,f=f.next;while(f!==i)}else p===null&&(f.shared.lanes=0);Wr|=E,n.lanes=E,n.memoizedState=ye}}function Zh(n,i,o){if(n=i.effects,i.effects=null,n!==null)for(i=0;i<n.length;i++){var c=n[i],f=c.callback;if(f!==null){if(c.callback=null,c=o,typeof f!="function")throw Error(t(191,f));f.call(c)}}}var Fo={},bi=dr(Fo),ko=dr(Fo),Oo=dr(Fo);function Gr(n){if(n===Fo)throw Error(t(174));return n}function su(n,i){switch(kt(Oo,i),kt(ko,n),kt(bi,Fo),n=i.nodeType,n){case 9:case 11:i=(i=i.documentElement)?i.namespaceURI:je(null,"");break;default:n=n===8?i.parentNode:i,i=n.namespaceURI||null,n=n.tagName,i=je(i,n)}Bt(bi),kt(bi,i)}function Ds(){Bt(bi),Bt(ko),Bt(Oo)}function Kh(n){Gr(Oo.current);var i=Gr(bi.current),o=je(i,n.type);i!==o&&(kt(ko,n),kt(bi,o))}function ou(n){ko.current===n&&(Bt(bi),Bt(ko))}var jt=dr(0);function Ya(n){for(var i=n;i!==null;){if(i.tag===13){var o=i.memoizedState;if(o!==null&&(o=o.dehydrated,o===null||o.data==="$?"||o.data==="$!"))return i}else if(i.tag===19&&i.memoizedProps.revealOrder!==void 0){if((i.flags&128)!==0)return i}else if(i.child!==null){i.child.return=i,i=i.child;continue}if(i===n)break;for(;i.sibling===null;){if(i.return===null||i.return===n)return null;i=i.return}i.sibling.return=i.return,i=i.sibling}return null}var au=[];function lu(){for(var n=0;n<au.length;n++)au[n]._workInProgressVersionPrimary=null;au.length=0}var qa=w.ReactCurrentDispatcher,cu=w.ReactCurrentBatchConfig,jr=0,Wt=null,nn=null,an=null,Za=!1,zo=!1,Bo=0,vv=0;function vn(){throw Error(t(321))}function uu(n,i){if(i===null)return!1;for(var o=0;o<i.length&&o<n.length;o++)if(!ci(n[o],i[o]))return!1;return!0}function du(n,i,o,c,f,p){if(jr=p,Wt=i,i.memoizedState=null,i.updateQueue=null,i.lanes=0,qa.current=n===null||n.memoizedState===null?Mv:Ev,n=o(c,f),zo){p=0;do{if(zo=!1,Bo=0,25<=p)throw Error(t(301));p+=1,an=nn=null,i.updateQueue=null,qa.current=wv,n=o(c,f)}while(zo)}if(qa.current=Ja,i=nn!==null&&nn.next!==null,jr=0,an=nn=Wt=null,Za=!1,i)throw Error(t(300));return n}function fu(){var n=Bo!==0;return Bo=0,n}function Ai(){var n={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};return an===null?Wt.memoizedState=an=n:an=an.next=n,an}function ei(){if(nn===null){var n=Wt.alternate;n=n!==null?n.memoizedState:null}else n=nn.next;var i=an===null?Wt.memoizedState:an.next;if(i!==null)an=i,nn=n;else{if(n===null)throw Error(t(310));nn=n,n={memoizedState:nn.memoizedState,baseState:nn.baseState,baseQueue:nn.baseQueue,queue:nn.queue,next:null},an===null?Wt.memoizedState=an=n:an=an.next=n}return an}function Ho(n,i){return typeof i=="function"?i(n):i}function hu(n){var i=ei(),o=i.queue;if(o===null)throw Error(t(311));o.lastRenderedReducer=n;var c=nn,f=c.baseQueue,p=o.pending;if(p!==null){if(f!==null){var E=f.next;f.next=p.next,p.next=E}c.baseQueue=f=p,o.pending=null}if(f!==null){p=f.next,c=c.baseState;var k=E=null,G=null,ae=p;do{var _e=ae.lane;if((jr&_e)===_e)G!==null&&(G=G.next={lane:0,action:ae.action,hasEagerState:ae.hasEagerState,eagerState:ae.eagerState,next:null}),c=ae.hasEagerState?ae.eagerState:n(c,ae.action);else{var ye={lane:_e,action:ae.action,hasEagerState:ae.hasEagerState,eagerState:ae.eagerState,next:null};G===null?(k=G=ye,E=c):G=G.next=ye,Wt.lanes|=_e,Wr|=_e}ae=ae.next}while(ae!==null&&ae!==p);G===null?E=c:G.next=k,ci(c,i.memoizedState)||(On=!0),i.memoizedState=c,i.baseState=E,i.baseQueue=G,o.lastRenderedState=c}if(n=o.interleaved,n!==null){f=n;do p=f.lane,Wt.lanes|=p,Wr|=p,f=f.next;while(f!==n)}else f===null&&(o.lanes=0);return[i.memoizedState,o.dispatch]}function pu(n){var i=ei(),o=i.queue;if(o===null)throw Error(t(311));o.lastRenderedReducer=n;var c=o.dispatch,f=o.pending,p=i.memoizedState;if(f!==null){o.pending=null;var E=f=f.next;do p=n(p,E.action),E=E.next;while(E!==f);ci(p,i.memoizedState)||(On=!0),i.memoizedState=p,i.baseQueue===null&&(i.baseState=p),o.lastRenderedState=p}return[p,c]}function Qh(){}function Jh(n,i){var o=Wt,c=ei(),f=i(),p=!ci(c.memoizedState,f);if(p&&(c.memoizedState=f,On=!0),c=c.queue,mu(np.bind(null,o,c,n),[n]),c.getSnapshot!==i||p||an!==null&&an.memoizedState.tag&1){if(o.flags|=2048,Vo(9,tp.bind(null,o,c,f,i),void 0,null),ln===null)throw Error(t(349));(jr&30)!==0||ep(o,i,f)}return f}function ep(n,i,o){n.flags|=16384,n={getSnapshot:i,value:o},i=Wt.updateQueue,i===null?(i={lastEffect:null,stores:null},Wt.updateQueue=i,i.stores=[n]):(o=i.stores,o===null?i.stores=[n]:o.push(n))}function tp(n,i,o,c){i.value=o,i.getSnapshot=c,ip(i)&&rp(n)}function np(n,i,o){return o(function(){ip(i)&&rp(n)})}function ip(n){var i=n.getSnapshot;n=n.value;try{var o=i();return!ci(n,o)}catch{return!0}}function rp(n){var i=Bi(n,1);i!==null&&pi(i,n,1,-1)}function sp(n){var i=Ai();return typeof n=="function"&&(n=n()),i.memoizedState=i.baseState=n,n={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:Ho,lastRenderedState:n},i.queue=n,n=n.dispatch=Sv.bind(null,Wt,n),[i.memoizedState,n]}function Vo(n,i,o,c){return n={tag:n,create:i,destroy:o,deps:c,next:null},i=Wt.updateQueue,i===null?(i={lastEffect:null,stores:null},Wt.updateQueue=i,i.lastEffect=n.next=n):(o=i.lastEffect,o===null?i.lastEffect=n.next=n:(c=o.next,o.next=n,n.next=c,i.lastEffect=n)),n}function op(){return ei().memoizedState}function Ka(n,i,o,c){var f=Ai();Wt.flags|=n,f.memoizedState=Vo(1|i,o,void 0,c===void 0?null:c)}function Qa(n,i,o,c){var f=ei();c=c===void 0?null:c;var p=void 0;if(nn!==null){var E=nn.memoizedState;if(p=E.destroy,c!==null&&uu(c,E.deps)){f.memoizedState=Vo(i,o,p,c);return}}Wt.flags|=n,f.memoizedState=Vo(1|i,o,p,c)}function ap(n,i){return Ka(8390656,8,n,i)}function mu(n,i){return Qa(2048,8,n,i)}function lp(n,i){return Qa(4,2,n,i)}function cp(n,i){return Qa(4,4,n,i)}function up(n,i){if(typeof i=="function")return n=n(),i(n),function(){i(null)};if(i!=null)return n=n(),i.current=n,function(){i.current=null}}function dp(n,i,o){return o=o!=null?o.concat([n]):null,Qa(4,4,up.bind(null,i,n),o)}function gu(){}function fp(n,i){var o=ei();i=i===void 0?null:i;var c=o.memoizedState;return c!==null&&i!==null&&uu(i,c[1])?c[0]:(o.memoizedState=[n,i],n)}function hp(n,i){var o=ei();i=i===void 0?null:i;var c=o.memoizedState;return c!==null&&i!==null&&uu(i,c[1])?c[0]:(n=n(),o.memoizedState=[n,i],n)}function pp(n,i,o){return(jr&21)===0?(n.baseState&&(n.baseState=!1,On=!0),n.memoizedState=o):(ci(o,i)||(o=bn(),Wt.lanes|=o,Wr|=o,n.baseState=!0),i)}function _v(n,i){var o=Nt;Nt=o!==0&&4>o?o:4,n(!0);var c=cu.transition;cu.transition={};try{n(!1),i()}finally{Nt=o,cu.transition=c}}function mp(){return ei().memoizedState}function yv(n,i,o){var c=_r(n);if(o={lane:c,action:o,hasEagerState:!1,eagerState:null,next:null},gp(n))xp(i,o);else if(o=$h(n,i,o,c),o!==null){var f=Cn();pi(o,n,c,f),vp(o,i,c)}}function Sv(n,i,o){var c=_r(n),f={lane:c,action:o,hasEagerState:!1,eagerState:null,next:null};if(gp(n))xp(i,f);else{var p=n.alternate;if(n.lanes===0&&(p===null||p.lanes===0)&&(p=i.lastRenderedReducer,p!==null))try{var E=i.lastRenderedState,k=p(E,o);if(f.hasEagerState=!0,f.eagerState=k,ci(k,E)){var G=i.interleaved;G===null?(f.next=f,iu(i)):(f.next=G.next,G.next=f),i.interleaved=f;return}}catch{}finally{}o=$h(n,i,f,c),o!==null&&(f=Cn(),pi(o,n,c,f),vp(o,i,c))}}function gp(n){var i=n.alternate;return n===Wt||i!==null&&i===Wt}function xp(n,i){zo=Za=!0;var o=n.pending;o===null?i.next=i:(i.next=o.next,o.next=i),n.pending=i}function vp(n,i,o){if((o&4194240)!==0){var c=i.lanes;c&=n.pendingLanes,o|=c,i.lanes=o,vc(n,o)}}var Ja={readContext:Jn,useCallback:vn,useContext:vn,useEffect:vn,useImperativeHandle:vn,useInsertionEffect:vn,useLayoutEffect:vn,useMemo:vn,useReducer:vn,useRef:vn,useState:vn,useDebugValue:vn,useDeferredValue:vn,useTransition:vn,useMutableSource:vn,useSyncExternalStore:vn,useId:vn,unstable_isNewReconciler:!1},Mv={readContext:Jn,useCallback:function(n,i){return Ai().memoizedState=[n,i===void 0?null:i],n},useContext:Jn,useEffect:ap,useImperativeHandle:function(n,i,o){return o=o!=null?o.concat([n]):null,Ka(4194308,4,up.bind(null,i,n),o)},useLayoutEffect:function(n,i){return Ka(4194308,4,n,i)},useInsertionEffect:function(n,i){return Ka(4,2,n,i)},useMemo:function(n,i){var o=Ai();return i=i===void 0?null:i,n=n(),o.memoizedState=[n,i],n},useReducer:function(n,i,o){var c=Ai();return i=o!==void 0?o(i):i,c.memoizedState=c.baseState=i,n={pending:null,interleaved:null,lanes:0,dispatch:null,lastRenderedReducer:n,lastRenderedState:i},c.queue=n,n=n.dispatch=yv.bind(null,Wt,n),[c.memoizedState,n]},useRef:function(n){var i=Ai();return n={current:n},i.memoizedState=n},useState:sp,useDebugValue:gu,useDeferredValue:function(n){return Ai().memoizedState=n},useTransition:function(){var n=sp(!1),i=n[0];return n=_v.bind(null,n[1]),Ai().memoizedState=n,[i,n]},useMutableSource:function(){},useSyncExternalStore:function(n,i,o){var c=Wt,f=Ai();if(Vt){if(o===void 0)throw Error(t(407));o=o()}else{if(o=i(),ln===null)throw Error(t(349));(jr&30)!==0||ep(c,i,o)}f.memoizedState=o;var p={value:o,getSnapshot:i};return f.queue=p,ap(np.bind(null,c,p,n),[n]),c.flags|=2048,Vo(9,tp.bind(null,c,p,o,i),void 0,null),o},useId:function(){var n=Ai(),i=ln.identifierPrefix;if(Vt){var o=zi,c=Oi;o=(c&~(1<<32-ct(c)-1)).toString(32)+o,i=":"+i+"R"+o,o=Bo++,0<o&&(i+="H"+o.toString(32)),i+=":"}else o=vv++,i=":"+i+"r"+o.toString(32)+":";return n.memoizedState=i},unstable_isNewReconciler:!1},Ev={readContext:Jn,useCallback:fp,useContext:Jn,useEffect:mu,useImperativeHandle:dp,useInsertionEffect:lp,useLayoutEffect:cp,useMemo:hp,useReducer:hu,useRef:op,useState:function(){return hu(Ho)},useDebugValue:gu,useDeferredValue:function(n){var i=ei();return pp(i,nn.memoizedState,n)},useTransition:function(){var n=hu(Ho)[0],i=ei().memoizedState;return[n,i]},useMutableSource:Qh,useSyncExternalStore:Jh,useId:mp,unstable_isNewReconciler:!1},wv={readContext:Jn,useCallback:fp,useContext:Jn,useEffect:mu,useImperativeHandle:dp,useInsertionEffect:lp,useLayoutEffect:cp,useMemo:hp,useReducer:pu,useRef:op,useState:function(){return pu(Ho)},useDebugValue:gu,useDeferredValue:function(n){var i=ei();return nn===null?i.memoizedState=n:pp(i,nn.memoizedState,n)},useTransition:function(){var n=pu(Ho)[0],i=ei().memoizedState;return[n,i]},useMutableSource:Qh,useSyncExternalStore:Jh,useId:mp,unstable_isNewReconciler:!1};function di(n,i){if(n&&n.defaultProps){i=q({},i),n=n.defaultProps;for(var o in n)i[o]===void 0&&(i[o]=n[o]);return i}return i}function xu(n,i,o,c){i=n.memoizedState,o=o(c,i),o=o==null?i:q({},i,o),n.memoizedState=o,n.lanes===0&&(n.updateQueue.baseState=o)}var el={isMounted:function(n){return(n=n._reactInternals)?Ei(n)===n:!1},enqueueSetState:function(n,i,o){n=n._reactInternals;var c=Cn(),f=_r(n),p=Hi(c,f);p.payload=i,o!=null&&(p.callback=o),i=mr(n,p,f),i!==null&&(pi(i,n,f,c),Xa(i,n,f))},enqueueReplaceState:function(n,i,o){n=n._reactInternals;var c=Cn(),f=_r(n),p=Hi(c,f);p.tag=1,p.payload=i,o!=null&&(p.callback=o),i=mr(n,p,f),i!==null&&(pi(i,n,f,c),Xa(i,n,f))},enqueueForceUpdate:function(n,i){n=n._reactInternals;var o=Cn(),c=_r(n),f=Hi(o,c);f.tag=2,i!=null&&(f.callback=i),i=mr(n,f,c),i!==null&&(pi(i,n,c,o),Xa(i,n,c))}};function _p(n,i,o,c,f,p,E){return n=n.stateNode,typeof n.shouldComponentUpdate=="function"?n.shouldComponentUpdate(c,p,E):i.prototype&&i.prototype.isPureReactComponent?!Co(o,c)||!Co(f,p):!0}function yp(n,i,o){var c=!1,f=fr,p=i.contextType;return typeof p=="object"&&p!==null?p=Jn(p):(f=kn(i)?zr:xn.current,c=i.contextTypes,p=(c=c!=null)?bs(n,f):fr),i=new i(o,p),n.memoizedState=i.state!==null&&i.state!==void 0?i.state:null,i.updater=el,n.stateNode=i,i._reactInternals=n,c&&(n=n.stateNode,n.__reactInternalMemoizedUnmaskedChildContext=f,n.__reactInternalMemoizedMaskedChildContext=p),i}function Sp(n,i,o,c){n=i.state,typeof i.componentWillReceiveProps=="function"&&i.componentWillReceiveProps(o,c),typeof i.UNSAFE_componentWillReceiveProps=="function"&&i.UNSAFE_componentWillReceiveProps(o,c),i.state!==n&&el.enqueueReplaceState(i,i.state,null)}function vu(n,i,o,c){var f=n.stateNode;f.props=o,f.state=n.memoizedState,f.refs={},ru(n);var p=i.contextType;typeof p=="object"&&p!==null?f.context=Jn(p):(p=kn(i)?zr:xn.current,f.context=bs(n,p)),f.state=n.memoizedState,p=i.getDerivedStateFromProps,typeof p=="function"&&(xu(n,i,p,o),f.state=n.memoizedState),typeof i.getDerivedStateFromProps=="function"||typeof f.getSnapshotBeforeUpdate=="function"||typeof f.UNSAFE_componentWillMount!="function"&&typeof f.componentWillMount!="function"||(i=f.state,typeof f.componentWillMount=="function"&&f.componentWillMount(),typeof f.UNSAFE_componentWillMount=="function"&&f.UNSAFE_componentWillMount(),i!==f.state&&el.enqueueReplaceState(f,f.state,null),$a(n,o,f,c),f.state=n.memoizedState),typeof f.componentDidMount=="function"&&(n.flags|=4194308)}function Is(n,i){try{var o="",c=i;do o+=fe(c),c=c.return;while(c);var f=o}catch(p){f=`
Error generating stack: `+p.message+`
`+p.stack}return{value:n,source:i,stack:f,digest:null}}function _u(n,i,o){return{value:n,source:null,stack:o??null,digest:i??null}}function yu(n,i){try{console.error(i.value)}catch(o){setTimeout(function(){throw o})}}var Tv=typeof WeakMap=="function"?WeakMap:Map;function Mp(n,i,o){o=Hi(-1,o),o.tag=3,o.payload={element:null};var c=i.value;return o.callback=function(){al||(al=!0,Uu=c),yu(n,i)},o}function Ep(n,i,o){o=Hi(-1,o),o.tag=3;var c=n.type.getDerivedStateFromError;if(typeof c=="function"){var f=i.value;o.payload=function(){return c(f)},o.callback=function(){yu(n,i)}}var p=n.stateNode;return p!==null&&typeof p.componentDidCatch=="function"&&(o.callback=function(){yu(n,i),typeof c!="function"&&(xr===null?xr=new Set([this]):xr.add(this));var E=i.stack;this.componentDidCatch(i.value,{componentStack:E!==null?E:""})}),o}function wp(n,i,o){var c=n.pingCache;if(c===null){c=n.pingCache=new Tv;var f=new Set;c.set(i,f)}else f=c.get(i),f===void 0&&(f=new Set,c.set(i,f));f.has(o)||(f.add(o),n=zv.bind(null,n,i,o),i.then(n,n))}function Tp(n){do{var i;if((i=n.tag===13)&&(i=n.memoizedState,i=i!==null?i.dehydrated!==null:!0),i)return n;n=n.return}while(n!==null);return null}function bp(n,i,o,c,f){return(n.mode&1)===0?(n===i?n.flags|=65536:(n.flags|=128,o.flags|=131072,o.flags&=-52805,o.tag===1&&(o.alternate===null?o.tag=17:(i=Hi(-1,1),i.tag=2,mr(o,i,1))),o.lanes|=1),n):(n.flags|=65536,n.lanes=f,n)}var bv=w.ReactCurrentOwner,On=!1;function An(n,i,o,c){i.child=n===null?Xh(i,null,o,c):Ps(i,n.child,o,c)}function Ap(n,i,o,c,f){o=o.render;var p=i.ref;return Ls(i,f),c=du(n,i,o,c,p,f),o=fu(),n!==null&&!On?(i.updateQueue=n.updateQueue,i.flags&=-2053,n.lanes&=~f,Vi(n,i,f)):(Vt&&o&&Yc(i),i.flags|=1,An(n,i,c,f),i.child)}function Cp(n,i,o,c,f){if(n===null){var p=o.type;return typeof p=="function"&&!Vu(p)&&p.defaultProps===void 0&&o.compare===null&&o.defaultProps===void 0?(i.tag=15,i.type=p,Rp(n,i,p,c,f)):(n=hl(o.type,null,c,i,i.mode,f),n.ref=i.ref,n.return=i,i.child=n)}if(p=n.child,(n.lanes&f)===0){var E=p.memoizedProps;if(o=o.compare,o=o!==null?o:Co,o(E,c)&&n.ref===i.ref)return Vi(n,i,f)}return i.flags|=1,n=Sr(p,c),n.ref=i.ref,n.return=i,i.child=n}function Rp(n,i,o,c,f){if(n!==null){var p=n.memoizedProps;if(Co(p,c)&&n.ref===i.ref)if(On=!1,i.pendingProps=c=p,(n.lanes&f)!==0)(n.flags&131072)!==0&&(On=!0);else return i.lanes=n.lanes,Vi(n,i,f)}return Su(n,i,o,c,f)}function Pp(n,i,o){var c=i.pendingProps,f=c.children,p=n!==null?n.memoizedState:null;if(c.mode==="hidden")if((i.mode&1)===0)i.memoizedState={baseLanes:0,cachePool:null,transitions:null},kt(Fs,Xn),Xn|=o;else{if((o&1073741824)===0)return n=p!==null?p.baseLanes|o:o,i.lanes=i.childLanes=1073741824,i.memoizedState={baseLanes:n,cachePool:null,transitions:null},i.updateQueue=null,kt(Fs,Xn),Xn|=n,null;i.memoizedState={baseLanes:0,cachePool:null,transitions:null},c=p!==null?p.baseLanes:o,kt(Fs,Xn),Xn|=c}else p!==null?(c=p.baseLanes|o,i.memoizedState=null):c=o,kt(Fs,Xn),Xn|=c;return An(n,i,f,o),i.child}function Np(n,i){var o=i.ref;(n===null&&o!==null||n!==null&&n.ref!==o)&&(i.flags|=512,i.flags|=2097152)}function Su(n,i,o,c,f){var p=kn(o)?zr:xn.current;return p=bs(i,p),Ls(i,f),o=du(n,i,o,c,p,f),c=fu(),n!==null&&!On?(i.updateQueue=n.updateQueue,i.flags&=-2053,n.lanes&=~f,Vi(n,i,f)):(Vt&&c&&Yc(i),i.flags|=1,An(n,i,o,f),i.child)}function Lp(n,i,o,c,f){if(kn(o)){var p=!0;Oa(i)}else p=!1;if(Ls(i,f),i.stateNode===null)nl(n,i),yp(i,o,c),vu(i,o,c,f),c=!0;else if(n===null){var E=i.stateNode,k=i.memoizedProps;E.props=k;var G=E.context,ae=o.contextType;typeof ae=="object"&&ae!==null?ae=Jn(ae):(ae=kn(o)?zr:xn.current,ae=bs(i,ae));var _e=o.getDerivedStateFromProps,ye=typeof _e=="function"||typeof E.getSnapshotBeforeUpdate=="function";ye||typeof E.UNSAFE_componentWillReceiveProps!="function"&&typeof E.componentWillReceiveProps!="function"||(k!==c||G!==ae)&&Sp(i,E,c,ae),pr=!1;var ge=i.memoizedState;E.state=ge,$a(i,c,E,f),G=i.memoizedState,k!==c||ge!==G||Fn.current||pr?(typeof _e=="function"&&(xu(i,o,_e,c),G=i.memoizedState),(k=pr||_p(i,o,k,c,ge,G,ae))?(ye||typeof E.UNSAFE_componentWillMount!="function"&&typeof E.componentWillMount!="function"||(typeof E.componentWillMount=="function"&&E.componentWillMount(),typeof E.UNSAFE_componentWillMount=="function"&&E.UNSAFE_componentWillMount()),typeof E.componentDidMount=="function"&&(i.flags|=4194308)):(typeof E.componentDidMount=="function"&&(i.flags|=4194308),i.memoizedProps=c,i.memoizedState=G),E.props=c,E.state=G,E.context=ae,c=k):(typeof E.componentDidMount=="function"&&(i.flags|=4194308),c=!1)}else{E=i.stateNode,Yh(n,i),k=i.memoizedProps,ae=i.type===i.elementType?k:di(i.type,k),E.props=ae,ye=i.pendingProps,ge=E.context,G=o.contextType,typeof G=="object"&&G!==null?G=Jn(G):(G=kn(o)?zr:xn.current,G=bs(i,G));var Ue=o.getDerivedStateFromProps;(_e=typeof Ue=="function"||typeof E.getSnapshotBeforeUpdate=="function")||typeof E.UNSAFE_componentWillReceiveProps!="function"&&typeof E.componentWillReceiveProps!="function"||(k!==ye||ge!==G)&&Sp(i,E,c,G),pr=!1,ge=i.memoizedState,E.state=ge,$a(i,c,E,f);var He=i.memoizedState;k!==ye||ge!==He||Fn.current||pr?(typeof Ue=="function"&&(xu(i,o,Ue,c),He=i.memoizedState),(ae=pr||_p(i,o,ae,c,ge,He,G)||!1)?(_e||typeof E.UNSAFE_componentWillUpdate!="function"&&typeof E.componentWillUpdate!="function"||(typeof E.componentWillUpdate=="function"&&E.componentWillUpdate(c,He,G),typeof E.UNSAFE_componentWillUpdate=="function"&&E.UNSAFE_componentWillUpdate(c,He,G)),typeof E.componentDidUpdate=="function"&&(i.flags|=4),typeof E.getSnapshotBeforeUpdate=="function"&&(i.flags|=1024)):(typeof E.componentDidUpdate!="function"||k===n.memoizedProps&&ge===n.memoizedState||(i.flags|=4),typeof E.getSnapshotBeforeUpdate!="function"||k===n.memoizedProps&&ge===n.memoizedState||(i.flags|=1024),i.memoizedProps=c,i.memoizedState=He),E.props=c,E.state=He,E.context=G,c=ae):(typeof E.componentDidUpdate!="function"||k===n.memoizedProps&&ge===n.memoizedState||(i.flags|=4),typeof E.getSnapshotBeforeUpdate!="function"||k===n.memoizedProps&&ge===n.memoizedState||(i.flags|=1024),c=!1)}return Mu(n,i,o,c,p,f)}function Mu(n,i,o,c,f,p){Np(n,i);var E=(i.flags&128)!==0;if(!c&&!E)return f&&kh(i,o,!1),Vi(n,i,p);c=i.stateNode,bv.current=i;var k=E&&typeof o.getDerivedStateFromError!="function"?null:c.render();return i.flags|=1,n!==null&&E?(i.child=Ps(i,n.child,null,p),i.child=Ps(i,null,k,p)):An(n,i,k,p),i.memoizedState=c.state,f&&kh(i,o,!0),i.child}function Dp(n){var i=n.stateNode;i.pendingContext?Uh(n,i.pendingContext,i.pendingContext!==i.context):i.context&&Uh(n,i.context,!1),su(n,i.containerInfo)}function Ip(n,i,o,c,f){return Rs(),Qc(f),i.flags|=256,An(n,i,o,c),i.child}var Eu={dehydrated:null,treeContext:null,retryLane:0};function wu(n){return{baseLanes:n,cachePool:null,transitions:null}}function Up(n,i,o){var c=i.pendingProps,f=jt.current,p=!1,E=(i.flags&128)!==0,k;if((k=E)||(k=n!==null&&n.memoizedState===null?!1:(f&2)!==0),k?(p=!0,i.flags&=-129):(n===null||n.memoizedState!==null)&&(f|=1),kt(jt,f&1),n===null)return Kc(i),n=i.memoizedState,n!==null&&(n=n.dehydrated,n!==null)?((i.mode&1)===0?i.lanes=1:n.data==="$!"?i.lanes=8:i.lanes=1073741824,null):(E=c.children,n=c.fallback,p?(c=i.mode,p=i.child,E={mode:"hidden",children:E},(c&1)===0&&p!==null?(p.childLanes=0,p.pendingProps=E):p=pl(E,c,0,null),n=qr(n,c,o,null),p.return=i,n.return=i,p.sibling=n,i.child=p,i.child.memoizedState=wu(o),i.memoizedState=Eu,n):Tu(i,E));if(f=n.memoizedState,f!==null&&(k=f.dehydrated,k!==null))return Av(n,i,E,c,k,f,o);if(p){p=c.fallback,E=i.mode,f=n.child,k=f.sibling;var G={mode:"hidden",children:c.children};return(E&1)===0&&i.child!==f?(c=i.child,c.childLanes=0,c.pendingProps=G,i.deletions=null):(c=Sr(f,G),c.subtreeFlags=f.subtreeFlags&14680064),k!==null?p=Sr(k,p):(p=qr(p,E,o,null),p.flags|=2),p.return=i,c.return=i,c.sibling=p,i.child=c,c=p,p=i.child,E=n.child.memoizedState,E=E===null?wu(o):{baseLanes:E.baseLanes|o,cachePool:null,transitions:E.transitions},p.memoizedState=E,p.childLanes=n.childLanes&~o,i.memoizedState=Eu,c}return p=n.child,n=p.sibling,c=Sr(p,{mode:"visible",children:c.children}),(i.mode&1)===0&&(c.lanes=o),c.return=i,c.sibling=null,n!==null&&(o=i.deletions,o===null?(i.deletions=[n],i.flags|=16):o.push(n)),i.child=c,i.memoizedState=null,c}function Tu(n,i){return i=pl({mode:"visible",children:i},n.mode,0,null),i.return=n,n.child=i}function tl(n,i,o,c){return c!==null&&Qc(c),Ps(i,n.child,null,o),n=Tu(i,i.pendingProps.children),n.flags|=2,i.memoizedState=null,n}function Av(n,i,o,c,f,p,E){if(o)return i.flags&256?(i.flags&=-257,c=_u(Error(t(422))),tl(n,i,E,c)):i.memoizedState!==null?(i.child=n.child,i.flags|=128,null):(p=c.fallback,f=i.mode,c=pl({mode:"visible",children:c.children},f,0,null),p=qr(p,f,E,null),p.flags|=2,c.return=i,p.return=i,c.sibling=p,i.child=c,(i.mode&1)!==0&&Ps(i,n.child,null,E),i.child.memoizedState=wu(E),i.memoizedState=Eu,p);if((i.mode&1)===0)return tl(n,i,E,null);if(f.data==="$!"){if(c=f.nextSibling&&f.nextSibling.dataset,c)var k=c.dgst;return c=k,p=Error(t(419)),c=_u(p,c,void 0),tl(n,i,E,c)}if(k=(E&n.childLanes)!==0,On||k){if(c=ln,c!==null){switch(E&-E){case 4:f=2;break;case 16:f=8;break;case 64:case 128:case 256:case 512:case 1024:case 2048:case 4096:case 8192:case 16384:case 32768:case 65536:case 131072:case 262144:case 524288:case 1048576:case 2097152:case 4194304:case 8388608:case 16777216:case 33554432:case 67108864:f=32;break;case 536870912:f=268435456;break;default:f=0}f=(f&(c.suspendedLanes|E))!==0?0:f,f!==0&&f!==p.retryLane&&(p.retryLane=f,Bi(n,f),pi(c,n,f,-1))}return Hu(),c=_u(Error(t(421))),tl(n,i,E,c)}return f.data==="$?"?(i.flags|=128,i.child=n.child,i=Bv.bind(null,n),f._reactRetry=i,null):(n=p.treeContext,Wn=ur(f.nextSibling),jn=i,Vt=!0,ui=null,n!==null&&(Kn[Qn++]=Oi,Kn[Qn++]=zi,Kn[Qn++]=Br,Oi=n.id,zi=n.overflow,Br=i),i=Tu(i,c.children),i.flags|=4096,i)}function Fp(n,i,o){n.lanes|=i;var c=n.alternate;c!==null&&(c.lanes|=i),nu(n.return,i,o)}function bu(n,i,o,c,f){var p=n.memoizedState;p===null?n.memoizedState={isBackwards:i,rendering:null,renderingStartTime:0,last:c,tail:o,tailMode:f}:(p.isBackwards=i,p.rendering=null,p.renderingStartTime=0,p.last=c,p.tail=o,p.tailMode=f)}function kp(n,i,o){var c=i.pendingProps,f=c.revealOrder,p=c.tail;if(An(n,i,c.children,o),c=jt.current,(c&2)!==0)c=c&1|2,i.flags|=128;else{if(n!==null&&(n.flags&128)!==0)e:for(n=i.child;n!==null;){if(n.tag===13)n.memoizedState!==null&&Fp(n,o,i);else if(n.tag===19)Fp(n,o,i);else if(n.child!==null){n.child.return=n,n=n.child;continue}if(n===i)break e;for(;n.sibling===null;){if(n.return===null||n.return===i)break e;n=n.return}n.sibling.return=n.return,n=n.sibling}c&=1}if(kt(jt,c),(i.mode&1)===0)i.memoizedState=null;else switch(f){case"forwards":for(o=i.child,f=null;o!==null;)n=o.alternate,n!==null&&Ya(n)===null&&(f=o),o=o.sibling;o=f,o===null?(f=i.child,i.child=null):(f=o.sibling,o.sibling=null),bu(i,!1,f,o,p);break;case"backwards":for(o=null,f=i.child,i.child=null;f!==null;){if(n=f.alternate,n!==null&&Ya(n)===null){i.child=f;break}n=f.sibling,f.sibling=o,o=f,f=n}bu(i,!0,o,null,p);break;case"together":bu(i,!1,null,null,void 0);break;default:i.memoizedState=null}return i.child}function nl(n,i){(i.mode&1)===0&&n!==null&&(n.alternate=null,i.alternate=null,i.flags|=2)}function Vi(n,i,o){if(n!==null&&(i.dependencies=n.dependencies),Wr|=i.lanes,(o&i.childLanes)===0)return null;if(n!==null&&i.child!==n.child)throw Error(t(153));if(i.child!==null){for(n=i.child,o=Sr(n,n.pendingProps),i.child=o,o.return=i;n.sibling!==null;)n=n.sibling,o=o.sibling=Sr(n,n.pendingProps),o.return=i;o.sibling=null}return i.child}function Cv(n,i,o){switch(i.tag){case 3:Dp(i),Rs();break;case 5:Kh(i);break;case 1:kn(i.type)&&Oa(i);break;case 4:su(i,i.stateNode.containerInfo);break;case 10:var c=i.type._context,f=i.memoizedProps.value;kt(ja,c._currentValue),c._currentValue=f;break;case 13:if(c=i.memoizedState,c!==null)return c.dehydrated!==null?(kt(jt,jt.current&1),i.flags|=128,null):(o&i.child.childLanes)!==0?Up(n,i,o):(kt(jt,jt.current&1),n=Vi(n,i,o),n!==null?n.sibling:null);kt(jt,jt.current&1);break;case 19:if(c=(o&i.childLanes)!==0,(n.flags&128)!==0){if(c)return kp(n,i,o);i.flags|=128}if(f=i.memoizedState,f!==null&&(f.rendering=null,f.tail=null,f.lastEffect=null),kt(jt,jt.current),c)break;return null;case 22:case 23:return i.lanes=0,Pp(n,i,o)}return Vi(n,i,o)}var Op,Au,zp,Bp;Op=function(n,i){for(var o=i.child;o!==null;){if(o.tag===5||o.tag===6)n.appendChild(o.stateNode);else if(o.tag!==4&&o.child!==null){o.child.return=o,o=o.child;continue}if(o===i)break;for(;o.sibling===null;){if(o.return===null||o.return===i)return;o=o.return}o.sibling.return=o.return,o=o.sibling}},Au=function(){},zp=function(n,i,o,c){var f=n.memoizedProps;if(f!==c){n=i.stateNode,Gr(bi.current);var p=null;switch(o){case"input":f=Y(n,f),c=Y(n,c),p=[];break;case"select":f=q({},f,{value:void 0}),c=q({},c,{value:void 0}),p=[];break;case"textarea":f=C(n,f),c=C(n,c),p=[];break;default:typeof f.onClick!="function"&&typeof c.onClick=="function"&&(n.onclick=Ua)}vt(o,c);var E;o=null;for(ae in f)if(!c.hasOwnProperty(ae)&&f.hasOwnProperty(ae)&&f[ae]!=null)if(ae==="style"){var k=f[ae];for(E in k)k.hasOwnProperty(E)&&(o||(o={}),o[E]="")}else ae!=="dangerouslySetInnerHTML"&&ae!=="children"&&ae!=="suppressContentEditableWarning"&&ae!=="suppressHydrationWarning"&&ae!=="autoFocus"&&(a.hasOwnProperty(ae)?p||(p=[]):(p=p||[]).push(ae,null));for(ae in c){var G=c[ae];if(k=f?.[ae],c.hasOwnProperty(ae)&&G!==k&&(G!=null||k!=null))if(ae==="style")if(k){for(E in k)!k.hasOwnProperty(E)||G&&G.hasOwnProperty(E)||(o||(o={}),o[E]="");for(E in G)G.hasOwnProperty(E)&&k[E]!==G[E]&&(o||(o={}),o[E]=G[E])}else o||(p||(p=[]),p.push(ae,o)),o=G;else ae==="dangerouslySetInnerHTML"?(G=G?G.__html:void 0,k=k?k.__html:void 0,G!=null&&k!==G&&(p=p||[]).push(ae,G)):ae==="children"?typeof G!="string"&&typeof G!="number"||(p=p||[]).push(ae,""+G):ae!=="suppressContentEditableWarning"&&ae!=="suppressHydrationWarning"&&(a.hasOwnProperty(ae)?(G!=null&&ae==="onScroll"&&zt("scroll",n),p||k===G||(p=[])):(p=p||[]).push(ae,G))}o&&(p=p||[]).push("style",o);var ae=p;(i.updateQueue=ae)&&(i.flags|=4)}},Bp=function(n,i,o,c){o!==c&&(i.flags|=4)};function Go(n,i){if(!Vt)switch(n.tailMode){case"hidden":i=n.tail;for(var o=null;i!==null;)i.alternate!==null&&(o=i),i=i.sibling;o===null?n.tail=null:o.sibling=null;break;case"collapsed":o=n.tail;for(var c=null;o!==null;)o.alternate!==null&&(c=o),o=o.sibling;c===null?i||n.tail===null?n.tail=null:n.tail.sibling=null:c.sibling=null}}function _n(n){var i=n.alternate!==null&&n.alternate.child===n.child,o=0,c=0;if(i)for(var f=n.child;f!==null;)o|=f.lanes|f.childLanes,c|=f.subtreeFlags&14680064,c|=f.flags&14680064,f.return=n,f=f.sibling;else for(f=n.child;f!==null;)o|=f.lanes|f.childLanes,c|=f.subtreeFlags,c|=f.flags,f.return=n,f=f.sibling;return n.subtreeFlags|=c,n.childLanes=o,i}function Rv(n,i,o){var c=i.pendingProps;switch(qc(i),i.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return _n(i),null;case 1:return kn(i.type)&&ka(),_n(i),null;case 3:return c=i.stateNode,Ds(),Bt(Fn),Bt(xn),lu(),c.pendingContext&&(c.context=c.pendingContext,c.pendingContext=null),(n===null||n.child===null)&&(Va(i)?i.flags|=4:n===null||n.memoizedState.isDehydrated&&(i.flags&256)===0||(i.flags|=1024,ui!==null&&(Ou(ui),ui=null))),Au(n,i),_n(i),null;case 5:ou(i);var f=Gr(Oo.current);if(o=i.type,n!==null&&i.stateNode!=null)zp(n,i,o,c,f),n.ref!==i.ref&&(i.flags|=512,i.flags|=2097152);else{if(!c){if(i.stateNode===null)throw Error(t(166));return _n(i),null}if(n=Gr(bi.current),Va(i)){c=i.stateNode,o=i.type;var p=i.memoizedProps;switch(c[Ti]=i,c[Do]=p,n=(i.mode&1)!==0,o){case"dialog":zt("cancel",c),zt("close",c);break;case"iframe":case"object":case"embed":zt("load",c);break;case"video":case"audio":for(f=0;f<Po.length;f++)zt(Po[f],c);break;case"source":zt("error",c);break;case"img":case"image":case"link":zt("error",c),zt("load",c);break;case"details":zt("toggle",c);break;case"input":dn(c,p),zt("invalid",c);break;case"select":c._wrapperState={wasMultiple:!!p.multiple},zt("invalid",c);break;case"textarea":se(c,p),zt("invalid",c)}vt(o,p),f=null;for(var E in p)if(p.hasOwnProperty(E)){var k=p[E];E==="children"?typeof k=="string"?c.textContent!==k&&(p.suppressHydrationWarning!==!0&&Ia(c.textContent,k,n),f=["children",k]):typeof k=="number"&&c.textContent!==""+k&&(p.suppressHydrationWarning!==!0&&Ia(c.textContent,k,n),f=["children",""+k]):a.hasOwnProperty(E)&&k!=null&&E==="onScroll"&&zt("scroll",c)}switch(o){case"input":Ze(c),Qe(c,p,!0);break;case"textarea":Ze(c),ve(c);break;case"select":case"option":break;default:typeof p.onClick=="function"&&(c.onclick=Ua)}c=f,i.updateQueue=c,c!==null&&(i.flags|=4)}else{E=f.nodeType===9?f:f.ownerDocument,n==="http://www.w3.org/1999/xhtml"&&(n=he(o)),n==="http://www.w3.org/1999/xhtml"?o==="script"?(n=E.createElement("div"),n.innerHTML="<script><\/script>",n=n.removeChild(n.firstChild)):typeof c.is=="string"?n=E.createElement(o,{is:c.is}):(n=E.createElement(o),o==="select"&&(E=n,c.multiple?E.multiple=!0:c.size&&(E.size=c.size))):n=E.createElementNS(n,o),n[Ti]=i,n[Do]=c,Op(n,i,!1,!1),i.stateNode=n;e:{switch(E=at(o,c),o){case"dialog":zt("cancel",n),zt("close",n),f=c;break;case"iframe":case"object":case"embed":zt("load",n),f=c;break;case"video":case"audio":for(f=0;f<Po.length;f++)zt(Po[f],n);f=c;break;case"source":zt("error",n),f=c;break;case"img":case"image":case"link":zt("error",n),zt("load",n),f=c;break;case"details":zt("toggle",n),f=c;break;case"input":dn(n,c),f=Y(n,c),zt("invalid",n);break;case"option":f=c;break;case"select":n._wrapperState={wasMultiple:!!c.multiple},f=q({},c,{value:void 0}),zt("invalid",n);break;case"textarea":se(n,c),f=C(n,c),zt("invalid",n);break;default:f=c}vt(o,f),k=f;for(p in k)if(k.hasOwnProperty(p)){var G=k[p];p==="style"?it(n,G):p==="dangerouslySetInnerHTML"?(G=G?G.__html:void 0,G!=null&&ke(n,G)):p==="children"?typeof G=="string"?(o!=="textarea"||G!=="")&&pt(n,G):typeof G=="number"&&pt(n,""+G):p!=="suppressContentEditableWarning"&&p!=="suppressHydrationWarning"&&p!=="autoFocus"&&(a.hasOwnProperty(p)?G!=null&&p==="onScroll"&&zt("scroll",n):G!=null&&N(n,p,G,E))}switch(o){case"input":Ze(n),Qe(n,c,!1);break;case"textarea":Ze(n),ve(n);break;case"option":c.value!=null&&n.setAttribute("value",""+Ae(c.value));break;case"select":n.multiple=!!c.multiple,p=c.value,p!=null?U(n,!!c.multiple,p,!1):c.defaultValue!=null&&U(n,!!c.multiple,c.defaultValue,!0);break;default:typeof f.onClick=="function"&&(n.onclick=Ua)}switch(o){case"button":case"input":case"select":case"textarea":c=!!c.autoFocus;break e;case"img":c=!0;break e;default:c=!1}}c&&(i.flags|=4)}i.ref!==null&&(i.flags|=512,i.flags|=2097152)}return _n(i),null;case 6:if(n&&i.stateNode!=null)Bp(n,i,n.memoizedProps,c);else{if(typeof c!="string"&&i.stateNode===null)throw Error(t(166));if(o=Gr(Oo.current),Gr(bi.current),Va(i)){if(c=i.stateNode,o=i.memoizedProps,c[Ti]=i,(p=c.nodeValue!==o)&&(n=jn,n!==null))switch(n.tag){case 3:Ia(c.nodeValue,o,(n.mode&1)!==0);break;case 5:n.memoizedProps.suppressHydrationWarning!==!0&&Ia(c.nodeValue,o,(n.mode&1)!==0)}p&&(i.flags|=4)}else c=(o.nodeType===9?o:o.ownerDocument).createTextNode(c),c[Ti]=i,i.stateNode=c}return _n(i),null;case 13:if(Bt(jt),c=i.memoizedState,n===null||n.memoizedState!==null&&n.memoizedState.dehydrated!==null){if(Vt&&Wn!==null&&(i.mode&1)!==0&&(i.flags&128)===0)Gh(),Rs(),i.flags|=98560,p=!1;else if(p=Va(i),c!==null&&c.dehydrated!==null){if(n===null){if(!p)throw Error(t(318));if(p=i.memoizedState,p=p!==null?p.dehydrated:null,!p)throw Error(t(317));p[Ti]=i}else Rs(),(i.flags&128)===0&&(i.memoizedState=null),i.flags|=4;_n(i),p=!1}else ui!==null&&(Ou(ui),ui=null),p=!0;if(!p)return i.flags&65536?i:null}return(i.flags&128)!==0?(i.lanes=o,i):(c=c!==null,c!==(n!==null&&n.memoizedState!==null)&&c&&(i.child.flags|=8192,(i.mode&1)!==0&&(n===null||(jt.current&1)!==0?rn===0&&(rn=3):Hu())),i.updateQueue!==null&&(i.flags|=4),_n(i),null);case 4:return Ds(),Au(n,i),n===null&&No(i.stateNode.containerInfo),_n(i),null;case 10:return tu(i.type._context),_n(i),null;case 17:return kn(i.type)&&ka(),_n(i),null;case 19:if(Bt(jt),p=i.memoizedState,p===null)return _n(i),null;if(c=(i.flags&128)!==0,E=p.rendering,E===null)if(c)Go(p,!1);else{if(rn!==0||n!==null&&(n.flags&128)!==0)for(n=i.child;n!==null;){if(E=Ya(n),E!==null){for(i.flags|=128,Go(p,!1),c=E.updateQueue,c!==null&&(i.updateQueue=c,i.flags|=4),i.subtreeFlags=0,c=o,o=i.child;o!==null;)p=o,n=c,p.flags&=14680066,E=p.alternate,E===null?(p.childLanes=0,p.lanes=n,p.child=null,p.subtreeFlags=0,p.memoizedProps=null,p.memoizedState=null,p.updateQueue=null,p.dependencies=null,p.stateNode=null):(p.childLanes=E.childLanes,p.lanes=E.lanes,p.child=E.child,p.subtreeFlags=0,p.deletions=null,p.memoizedProps=E.memoizedProps,p.memoizedState=E.memoizedState,p.updateQueue=E.updateQueue,p.type=E.type,n=E.dependencies,p.dependencies=n===null?null:{lanes:n.lanes,firstContext:n.firstContext}),o=o.sibling;return kt(jt,jt.current&1|2),i.child}n=n.sibling}p.tail!==null&&Ee()>ks&&(i.flags|=128,c=!0,Go(p,!1),i.lanes=4194304)}else{if(!c)if(n=Ya(E),n!==null){if(i.flags|=128,c=!0,o=n.updateQueue,o!==null&&(i.updateQueue=o,i.flags|=4),Go(p,!0),p.tail===null&&p.tailMode==="hidden"&&!E.alternate&&!Vt)return _n(i),null}else 2*Ee()-p.renderingStartTime>ks&&o!==1073741824&&(i.flags|=128,c=!0,Go(p,!1),i.lanes=4194304);p.isBackwards?(E.sibling=i.child,i.child=E):(o=p.last,o!==null?o.sibling=E:i.child=E,p.last=E)}return p.tail!==null?(i=p.tail,p.rendering=i,p.tail=i.sibling,p.renderingStartTime=Ee(),i.sibling=null,o=jt.current,kt(jt,c?o&1|2:o&1),i):(_n(i),null);case 22:case 23:return Bu(),c=i.memoizedState!==null,n!==null&&n.memoizedState!==null!==c&&(i.flags|=8192),c&&(i.mode&1)!==0?(Xn&1073741824)!==0&&(_n(i),i.subtreeFlags&6&&(i.flags|=8192)):_n(i),null;case 24:return null;case 25:return null}throw Error(t(156,i.tag))}function Pv(n,i){switch(qc(i),i.tag){case 1:return kn(i.type)&&ka(),n=i.flags,n&65536?(i.flags=n&-65537|128,i):null;case 3:return Ds(),Bt(Fn),Bt(xn),lu(),n=i.flags,(n&65536)!==0&&(n&128)===0?(i.flags=n&-65537|128,i):null;case 5:return ou(i),null;case 13:if(Bt(jt),n=i.memoizedState,n!==null&&n.dehydrated!==null){if(i.alternate===null)throw Error(t(340));Rs()}return n=i.flags,n&65536?(i.flags=n&-65537|128,i):null;case 19:return Bt(jt),null;case 4:return Ds(),null;case 10:return tu(i.type._context),null;case 22:case 23:return Bu(),null;case 24:return null;default:return null}}var il=!1,yn=!1,Nv=typeof WeakSet=="function"?WeakSet:Set,Oe=null;function Us(n,i){var o=n.ref;if(o!==null)if(typeof o=="function")try{o(null)}catch(c){$t(n,i,c)}else o.current=null}function Cu(n,i,o){try{o()}catch(c){$t(n,i,c)}}var Hp=!1;function Lv(n,i){if(Bc=Ea,n=_h(),Lc(n)){if("selectionStart"in n)var o={start:n.selectionStart,end:n.selectionEnd};else e:{o=(o=n.ownerDocument)&&o.defaultView||window;var c=o.getSelection&&o.getSelection();if(c&&c.rangeCount!==0){o=c.anchorNode;var f=c.anchorOffset,p=c.focusNode;c=c.focusOffset;try{o.nodeType,p.nodeType}catch{o=null;break e}var E=0,k=-1,G=-1,ae=0,_e=0,ye=n,ge=null;t:for(;;){for(var Ue;ye!==o||f!==0&&ye.nodeType!==3||(k=E+f),ye!==p||c!==0&&ye.nodeType!==3||(G=E+c),ye.nodeType===3&&(E+=ye.nodeValue.length),(Ue=ye.firstChild)!==null;)ge=ye,ye=Ue;for(;;){if(ye===n)break t;if(ge===o&&++ae===f&&(k=E),ge===p&&++_e===c&&(G=E),(Ue=ye.nextSibling)!==null)break;ye=ge,ge=ye.parentNode}ye=Ue}o=k===-1||G===-1?null:{start:k,end:G}}else o=null}o=o||{start:0,end:0}}else o=null;for(Hc={focusedElem:n,selectionRange:o},Ea=!1,Oe=i;Oe!==null;)if(i=Oe,n=i.child,(i.subtreeFlags&1028)!==0&&n!==null)n.return=i,Oe=n;else for(;Oe!==null;){i=Oe;try{var He=i.alternate;if((i.flags&1024)!==0)switch(i.tag){case 0:case 11:case 15:break;case 1:if(He!==null){var Ge=He.memoizedProps,Zt=He.memoizedState,ee=i.stateNode,W=ee.getSnapshotBeforeUpdate(i.elementType===i.type?Ge:di(i.type,Ge),Zt);ee.__reactInternalSnapshotBeforeUpdate=W}break;case 3:var re=i.stateNode.containerInfo;re.nodeType===1?re.textContent="":re.nodeType===9&&re.documentElement&&re.removeChild(re.documentElement);break;case 5:case 6:case 4:case 17:break;default:throw Error(t(163))}}catch(we){$t(i,i.return,we)}if(n=i.sibling,n!==null){n.return=i.return,Oe=n;break}Oe=i.return}return He=Hp,Hp=!1,He}function jo(n,i,o){var c=i.updateQueue;if(c=c!==null?c.lastEffect:null,c!==null){var f=c=c.next;do{if((f.tag&n)===n){var p=f.destroy;f.destroy=void 0,p!==void 0&&Cu(i,o,p)}f=f.next}while(f!==c)}}function rl(n,i){if(i=i.updateQueue,i=i!==null?i.lastEffect:null,i!==null){var o=i=i.next;do{if((o.tag&n)===n){var c=o.create;o.destroy=c()}o=o.next}while(o!==i)}}function Ru(n){var i=n.ref;if(i!==null){var o=n.stateNode;switch(n.tag){case 5:n=o;break;default:n=o}typeof i=="function"?i(n):i.current=n}}function Vp(n){var i=n.alternate;i!==null&&(n.alternate=null,Vp(i)),n.child=null,n.deletions=null,n.sibling=null,n.tag===5&&(i=n.stateNode,i!==null&&(delete i[Ti],delete i[Do],delete i[Wc],delete i[pv],delete i[mv])),n.stateNode=null,n.return=null,n.dependencies=null,n.memoizedProps=null,n.memoizedState=null,n.pendingProps=null,n.stateNode=null,n.updateQueue=null}function Gp(n){return n.tag===5||n.tag===3||n.tag===4}function jp(n){e:for(;;){for(;n.sibling===null;){if(n.return===null||Gp(n.return))return null;n=n.return}for(n.sibling.return=n.return,n=n.sibling;n.tag!==5&&n.tag!==6&&n.tag!==18;){if(n.flags&2||n.child===null||n.tag===4)continue e;n.child.return=n,n=n.child}if(!(n.flags&2))return n.stateNode}}function Pu(n,i,o){var c=n.tag;if(c===5||c===6)n=n.stateNode,i?o.nodeType===8?o.parentNode.insertBefore(n,i):o.insertBefore(n,i):(o.nodeType===8?(i=o.parentNode,i.insertBefore(n,o)):(i=o,i.appendChild(n)),o=o._reactRootContainer,o!=null||i.onclick!==null||(i.onclick=Ua));else if(c!==4&&(n=n.child,n!==null))for(Pu(n,i,o),n=n.sibling;n!==null;)Pu(n,i,o),n=n.sibling}function Nu(n,i,o){var c=n.tag;if(c===5||c===6)n=n.stateNode,i?o.insertBefore(n,i):o.appendChild(n);else if(c!==4&&(n=n.child,n!==null))for(Nu(n,i,o),n=n.sibling;n!==null;)Nu(n,i,o),n=n.sibling}var fn=null,fi=!1;function gr(n,i,o){for(o=o.child;o!==null;)Wp(n,i,o),o=o.sibling}function Wp(n,i,o){if(St&&typeof St.onCommitFiberUnmount=="function")try{St.onCommitFiberUnmount(Ct,o)}catch{}switch(o.tag){case 5:yn||Us(o,i);case 6:var c=fn,f=fi;fn=null,gr(n,i,o),fn=c,fi=f,fn!==null&&(fi?(n=fn,o=o.stateNode,n.nodeType===8?n.parentNode.removeChild(o):n.removeChild(o)):fn.removeChild(o.stateNode));break;case 18:fn!==null&&(fi?(n=fn,o=o.stateNode,n.nodeType===8?jc(n.parentNode,o):n.nodeType===1&&jc(n,o),Mo(n)):jc(fn,o.stateNode));break;case 4:c=fn,f=fi,fn=o.stateNode.containerInfo,fi=!0,gr(n,i,o),fn=c,fi=f;break;case 0:case 11:case 14:case 15:if(!yn&&(c=o.updateQueue,c!==null&&(c=c.lastEffect,c!==null))){f=c=c.next;do{var p=f,E=p.destroy;p=p.tag,E!==void 0&&((p&2)!==0||(p&4)!==0)&&Cu(o,i,E),f=f.next}while(f!==c)}gr(n,i,o);break;case 1:if(!yn&&(Us(o,i),c=o.stateNode,typeof c.componentWillUnmount=="function"))try{c.props=o.memoizedProps,c.state=o.memoizedState,c.componentWillUnmount()}catch(k){$t(o,i,k)}gr(n,i,o);break;case 21:gr(n,i,o);break;case 22:o.mode&1?(yn=(c=yn)||o.memoizedState!==null,gr(n,i,o),yn=c):gr(n,i,o);break;default:gr(n,i,o)}}function Xp(n){var i=n.updateQueue;if(i!==null){n.updateQueue=null;var o=n.stateNode;o===null&&(o=n.stateNode=new Nv),i.forEach(function(c){var f=Hv.bind(null,n,c);o.has(c)||(o.add(c),c.then(f,f))})}}function hi(n,i){var o=i.deletions;if(o!==null)for(var c=0;c<o.length;c++){var f=o[c];try{var p=n,E=i,k=E;e:for(;k!==null;){switch(k.tag){case 5:fn=k.stateNode,fi=!1;break e;case 3:fn=k.stateNode.containerInfo,fi=!0;break e;case 4:fn=k.stateNode.containerInfo,fi=!0;break e}k=k.return}if(fn===null)throw Error(t(160));Wp(p,E,f),fn=null,fi=!1;var G=f.alternate;G!==null&&(G.return=null),f.return=null}catch(ae){$t(f,i,ae)}}if(i.subtreeFlags&12854)for(i=i.child;i!==null;)$p(i,n),i=i.sibling}function $p(n,i){var o=n.alternate,c=n.flags;switch(n.tag){case 0:case 11:case 14:case 15:if(hi(i,n),Ci(n),c&4){try{jo(3,n,n.return),rl(3,n)}catch(Ge){$t(n,n.return,Ge)}try{jo(5,n,n.return)}catch(Ge){$t(n,n.return,Ge)}}break;case 1:hi(i,n),Ci(n),c&512&&o!==null&&Us(o,o.return);break;case 5:if(hi(i,n),Ci(n),c&512&&o!==null&&Us(o,o.return),n.flags&32){var f=n.stateNode;try{pt(f,"")}catch(Ge){$t(n,n.return,Ge)}}if(c&4&&(f=n.stateNode,f!=null)){var p=n.memoizedProps,E=o!==null?o.memoizedProps:p,k=n.type,G=n.updateQueue;if(n.updateQueue=null,G!==null)try{k==="input"&&p.type==="radio"&&p.name!=null&&yt(f,p),at(k,E);var ae=at(k,p);for(E=0;E<G.length;E+=2){var _e=G[E],ye=G[E+1];_e==="style"?it(f,ye):_e==="dangerouslySetInnerHTML"?ke(f,ye):_e==="children"?pt(f,ye):N(f,_e,ye,ae)}switch(k){case"input":xt(f,p);break;case"textarea":me(f,p);break;case"select":var ge=f._wrapperState.wasMultiple;f._wrapperState.wasMultiple=!!p.multiple;var Ue=p.value;Ue!=null?U(f,!!p.multiple,Ue,!1):ge!==!!p.multiple&&(p.defaultValue!=null?U(f,!!p.multiple,p.defaultValue,!0):U(f,!!p.multiple,p.multiple?[]:"",!1))}f[Do]=p}catch(Ge){$t(n,n.return,Ge)}}break;case 6:if(hi(i,n),Ci(n),c&4){if(n.stateNode===null)throw Error(t(162));f=n.stateNode,p=n.memoizedProps;try{f.nodeValue=p}catch(Ge){$t(n,n.return,Ge)}}break;case 3:if(hi(i,n),Ci(n),c&4&&o!==null&&o.memoizedState.isDehydrated)try{Mo(i.containerInfo)}catch(Ge){$t(n,n.return,Ge)}break;case 4:hi(i,n),Ci(n);break;case 13:hi(i,n),Ci(n),f=n.child,f.flags&8192&&(p=f.memoizedState!==null,f.stateNode.isHidden=p,!p||f.alternate!==null&&f.alternate.memoizedState!==null||(Iu=Ee())),c&4&&Xp(n);break;case 22:if(_e=o!==null&&o.memoizedState!==null,n.mode&1?(yn=(ae=yn)||_e,hi(i,n),yn=ae):hi(i,n),Ci(n),c&8192){if(ae=n.memoizedState!==null,(n.stateNode.isHidden=ae)&&!_e&&(n.mode&1)!==0)for(Oe=n,_e=n.child;_e!==null;){for(ye=Oe=_e;Oe!==null;){switch(ge=Oe,Ue=ge.child,ge.tag){case 0:case 11:case 14:case 15:jo(4,ge,ge.return);break;case 1:Us(ge,ge.return);var He=ge.stateNode;if(typeof He.componentWillUnmount=="function"){c=ge,o=ge.return;try{i=c,He.props=i.memoizedProps,He.state=i.memoizedState,He.componentWillUnmount()}catch(Ge){$t(c,o,Ge)}}break;case 5:Us(ge,ge.return);break;case 22:if(ge.memoizedState!==null){Zp(ye);continue}}Ue!==null?(Ue.return=ge,Oe=Ue):Zp(ye)}_e=_e.sibling}e:for(_e=null,ye=n;;){if(ye.tag===5){if(_e===null){_e=ye;try{f=ye.stateNode,ae?(p=f.style,typeof p.setProperty=="function"?p.setProperty("display","none","important"):p.display="none"):(k=ye.stateNode,G=ye.memoizedProps.style,E=G!=null&&G.hasOwnProperty("display")?G.display:null,k.style.display=tt("display",E))}catch(Ge){$t(n,n.return,Ge)}}}else if(ye.tag===6){if(_e===null)try{ye.stateNode.nodeValue=ae?"":ye.memoizedProps}catch(Ge){$t(n,n.return,Ge)}}else if((ye.tag!==22&&ye.tag!==23||ye.memoizedState===null||ye===n)&&ye.child!==null){ye.child.return=ye,ye=ye.child;continue}if(ye===n)break e;for(;ye.sibling===null;){if(ye.return===null||ye.return===n)break e;_e===ye&&(_e=null),ye=ye.return}_e===ye&&(_e=null),ye.sibling.return=ye.return,ye=ye.sibling}}break;case 19:hi(i,n),Ci(n),c&4&&Xp(n);break;case 21:break;default:hi(i,n),Ci(n)}}function Ci(n){var i=n.flags;if(i&2){try{e:{for(var o=n.return;o!==null;){if(Gp(o)){var c=o;break e}o=o.return}throw Error(t(160))}switch(c.tag){case 5:var f=c.stateNode;c.flags&32&&(pt(f,""),c.flags&=-33);var p=jp(n);Nu(n,p,f);break;case 3:case 4:var E=c.stateNode.containerInfo,k=jp(n);Pu(n,k,E);break;default:throw Error(t(161))}}catch(G){$t(n,n.return,G)}n.flags&=-3}i&4096&&(n.flags&=-4097)}function Dv(n,i,o){Oe=n,Yp(n)}function Yp(n,i,o){for(var c=(n.mode&1)!==0;Oe!==null;){var f=Oe,p=f.child;if(f.tag===22&&c){var E=f.memoizedState!==null||il;if(!E){var k=f.alternate,G=k!==null&&k.memoizedState!==null||yn;k=il;var ae=yn;if(il=E,(yn=G)&&!ae)for(Oe=f;Oe!==null;)E=Oe,G=E.child,E.tag===22&&E.memoizedState!==null?Kp(f):G!==null?(G.return=E,Oe=G):Kp(f);for(;p!==null;)Oe=p,Yp(p),p=p.sibling;Oe=f,il=k,yn=ae}qp(n)}else(f.subtreeFlags&8772)!==0&&p!==null?(p.return=f,Oe=p):qp(n)}}function qp(n){for(;Oe!==null;){var i=Oe;if((i.flags&8772)!==0){var o=i.alternate;try{if((i.flags&8772)!==0)switch(i.tag){case 0:case 11:case 15:yn||rl(5,i);break;case 1:var c=i.stateNode;if(i.flags&4&&!yn)if(o===null)c.componentDidMount();else{var f=i.elementType===i.type?o.memoizedProps:di(i.type,o.memoizedProps);c.componentDidUpdate(f,o.memoizedState,c.__reactInternalSnapshotBeforeUpdate)}var p=i.updateQueue;p!==null&&Zh(i,p,c);break;case 3:var E=i.updateQueue;if(E!==null){if(o=null,i.child!==null)switch(i.child.tag){case 5:o=i.child.stateNode;break;case 1:o=i.child.stateNode}Zh(i,E,o)}break;case 5:var k=i.stateNode;if(o===null&&i.flags&4){o=k;var G=i.memoizedProps;switch(i.type){case"button":case"input":case"select":case"textarea":G.autoFocus&&o.focus();break;case"img":G.src&&(o.src=G.src)}}break;case 6:break;case 4:break;case 12:break;case 13:if(i.memoizedState===null){var ae=i.alternate;if(ae!==null){var _e=ae.memoizedState;if(_e!==null){var ye=_e.dehydrated;ye!==null&&Mo(ye)}}}break;case 19:case 17:case 21:case 22:case 23:case 25:break;default:throw Error(t(163))}yn||i.flags&512&&Ru(i)}catch(ge){$t(i,i.return,ge)}}if(i===n){Oe=null;break}if(o=i.sibling,o!==null){o.return=i.return,Oe=o;break}Oe=i.return}}function Zp(n){for(;Oe!==null;){var i=Oe;if(i===n){Oe=null;break}var o=i.sibling;if(o!==null){o.return=i.return,Oe=o;break}Oe=i.return}}function Kp(n){for(;Oe!==null;){var i=Oe;try{switch(i.tag){case 0:case 11:case 15:var o=i.return;try{rl(4,i)}catch(G){$t(i,o,G)}break;case 1:var c=i.stateNode;if(typeof c.componentDidMount=="function"){var f=i.return;try{c.componentDidMount()}catch(G){$t(i,f,G)}}var p=i.return;try{Ru(i)}catch(G){$t(i,p,G)}break;case 5:var E=i.return;try{Ru(i)}catch(G){$t(i,E,G)}}}catch(G){$t(i,i.return,G)}if(i===n){Oe=null;break}var k=i.sibling;if(k!==null){k.return=i.return,Oe=k;break}Oe=i.return}}var Iv=Math.ceil,sl=w.ReactCurrentDispatcher,Lu=w.ReactCurrentOwner,ti=w.ReactCurrentBatchConfig,wt=0,ln=null,Qt=null,hn=0,Xn=0,Fs=dr(0),rn=0,Wo=null,Wr=0,ol=0,Du=0,Xo=null,zn=null,Iu=0,ks=1/0,Gi=null,al=!1,Uu=null,xr=null,ll=!1,vr=null,cl=0,$o=0,Fu=null,ul=-1,dl=0;function Cn(){return(wt&6)!==0?Ee():ul!==-1?ul:ul=Ee()}function _r(n){return(n.mode&1)===0?1:(wt&2)!==0&&hn!==0?hn&-hn:xv.transition!==null?(dl===0&&(dl=bn()),dl):(n=Nt,n!==0||(n=window.event,n=n===void 0?16:Jf(n.type)),n)}function pi(n,i,o,c){if(50<$o)throw $o=0,Fu=null,Error(t(185));Un(n,o,c),((wt&2)===0||n!==ln)&&(n===ln&&((wt&2)===0&&(ol|=o),rn===4&&yr(n,hn)),Bn(n,c),o===1&&wt===0&&(i.mode&1)===0&&(ks=Ee()+500,za&&hr()))}function Bn(n,i){var o=n.callbackNode;qn(n,i);var c=wi(n,n===ln?hn:0);if(c===0)o!==null&&ue(o),n.callbackNode=null,n.callbackPriority=0;else if(i=c&-c,n.callbackPriority!==i){if(o!=null&&ue(o),i===1)n.tag===0?gv(Jp.bind(null,n)):Oh(Jp.bind(null,n)),fv(function(){(wt&6)===0&&hr()}),o=null;else{switch(Wf(c)){case 1:o=Ve;break;case 4:o=rt;break;case 16:o=ot;break;case 536870912:o=Mt;break;default:o=ot}o=am(o,Qp.bind(null,n))}n.callbackPriority=i,n.callbackNode=o}}function Qp(n,i){if(ul=-1,dl=0,(wt&6)!==0)throw Error(t(327));var o=n.callbackNode;if(Os()&&n.callbackNode!==o)return null;var c=wi(n,n===ln?hn:0);if(c===0)return null;if((c&30)!==0||(c&n.expiredLanes)!==0||i)i=fl(n,c);else{i=c;var f=wt;wt|=2;var p=tm();(ln!==n||hn!==i)&&(Gi=null,ks=Ee()+500,$r(n,i));do try{kv();break}catch(k){em(n,k)}while(!0);eu(),sl.current=p,wt=f,Qt!==null?i=0:(ln=null,hn=0,i=rn)}if(i!==0){if(i===2&&(f=Ui(n),f!==0&&(c=f,i=ku(n,f))),i===1)throw o=Wo,$r(n,0),yr(n,c),Bn(n,Ee()),o;if(i===6)yr(n,c);else{if(f=n.current.alternate,(c&30)===0&&!Uv(f)&&(i=fl(n,c),i===2&&(p=Ui(n),p!==0&&(c=p,i=ku(n,p))),i===1))throw o=Wo,$r(n,0),yr(n,c),Bn(n,Ee()),o;switch(n.finishedWork=f,n.finishedLanes=c,i){case 0:case 1:throw Error(t(345));case 2:Yr(n,zn,Gi);break;case 3:if(yr(n,c),(c&130023424)===c&&(i=Iu+500-Ee(),10<i)){if(wi(n,0)!==0)break;if(f=n.suspendedLanes,(f&c)!==c){Cn(),n.pingedLanes|=n.suspendedLanes&f;break}n.timeoutHandle=Gc(Yr.bind(null,n,zn,Gi),i);break}Yr(n,zn,Gi);break;case 4:if(yr(n,c),(c&4194240)===c)break;for(i=n.eventTimes,f=-1;0<c;){var E=31-ct(c);p=1<<E,E=i[E],E>f&&(f=E),c&=~p}if(c=f,c=Ee()-c,c=(120>c?120:480>c?480:1080>c?1080:1920>c?1920:3e3>c?3e3:4320>c?4320:1960*Iv(c/1960))-c,10<c){n.timeoutHandle=Gc(Yr.bind(null,n,zn,Gi),c);break}Yr(n,zn,Gi);break;case 5:Yr(n,zn,Gi);break;default:throw Error(t(329))}}}return Bn(n,Ee()),n.callbackNode===o?Qp.bind(null,n):null}function ku(n,i){var o=Xo;return n.current.memoizedState.isDehydrated&&($r(n,i).flags|=256),n=fl(n,i),n!==2&&(i=zn,zn=o,i!==null&&Ou(i)),n}function Ou(n){zn===null?zn=n:zn.push.apply(zn,n)}function Uv(n){for(var i=n;;){if(i.flags&16384){var o=i.updateQueue;if(o!==null&&(o=o.stores,o!==null))for(var c=0;c<o.length;c++){var f=o[c],p=f.getSnapshot;f=f.value;try{if(!ci(p(),f))return!1}catch{return!1}}}if(o=i.child,i.subtreeFlags&16384&&o!==null)o.return=i,i=o;else{if(i===n)break;for(;i.sibling===null;){if(i.return===null||i.return===n)return!0;i=i.return}i.sibling.return=i.return,i=i.sibling}}return!0}function yr(n,i){for(i&=~Du,i&=~ol,n.suspendedLanes|=i,n.pingedLanes&=~i,n=n.expirationTimes;0<i;){var o=31-ct(i),c=1<<o;n[o]=-1,i&=~c}}function Jp(n){if((wt&6)!==0)throw Error(t(327));Os();var i=wi(n,0);if((i&1)===0)return Bn(n,Ee()),null;var o=fl(n,i);if(n.tag!==0&&o===2){var c=Ui(n);c!==0&&(i=c,o=ku(n,c))}if(o===1)throw o=Wo,$r(n,0),yr(n,i),Bn(n,Ee()),o;if(o===6)throw Error(t(345));return n.finishedWork=n.current.alternate,n.finishedLanes=i,Yr(n,zn,Gi),Bn(n,Ee()),null}function zu(n,i){var o=wt;wt|=1;try{return n(i)}finally{wt=o,wt===0&&(ks=Ee()+500,za&&hr())}}function Xr(n){vr!==null&&vr.tag===0&&(wt&6)===0&&Os();var i=wt;wt|=1;var o=ti.transition,c=Nt;try{if(ti.transition=null,Nt=1,n)return n()}finally{Nt=c,ti.transition=o,wt=i,(wt&6)===0&&hr()}}function Bu(){Xn=Fs.current,Bt(Fs)}function $r(n,i){n.finishedWork=null,n.finishedLanes=0;var o=n.timeoutHandle;if(o!==-1&&(n.timeoutHandle=-1,dv(o)),Qt!==null)for(o=Qt.return;o!==null;){var c=o;switch(qc(c),c.tag){case 1:c=c.type.childContextTypes,c!=null&&ka();break;case 3:Ds(),Bt(Fn),Bt(xn),lu();break;case 5:ou(c);break;case 4:Ds();break;case 13:Bt(jt);break;case 19:Bt(jt);break;case 10:tu(c.type._context);break;case 22:case 23:Bu()}o=o.return}if(ln=n,Qt=n=Sr(n.current,null),hn=Xn=i,rn=0,Wo=null,Du=ol=Wr=0,zn=Xo=null,Vr!==null){for(i=0;i<Vr.length;i++)if(o=Vr[i],c=o.interleaved,c!==null){o.interleaved=null;var f=c.next,p=o.pending;if(p!==null){var E=p.next;p.next=f,c.next=E}o.pending=c}Vr=null}return n}function em(n,i){do{var o=Qt;try{if(eu(),qa.current=Ja,Za){for(var c=Wt.memoizedState;c!==null;){var f=c.queue;f!==null&&(f.pending=null),c=c.next}Za=!1}if(jr=0,an=nn=Wt=null,zo=!1,Bo=0,Lu.current=null,o===null||o.return===null){rn=1,Wo=i,Qt=null;break}e:{var p=n,E=o.return,k=o,G=i;if(i=hn,k.flags|=32768,G!==null&&typeof G=="object"&&typeof G.then=="function"){var ae=G,_e=k,ye=_e.tag;if((_e.mode&1)===0&&(ye===0||ye===11||ye===15)){var ge=_e.alternate;ge?(_e.updateQueue=ge.updateQueue,_e.memoizedState=ge.memoizedState,_e.lanes=ge.lanes):(_e.updateQueue=null,_e.memoizedState=null)}var Ue=Tp(E);if(Ue!==null){Ue.flags&=-257,bp(Ue,E,k,p,i),Ue.mode&1&&wp(p,ae,i),i=Ue,G=ae;var He=i.updateQueue;if(He===null){var Ge=new Set;Ge.add(G),i.updateQueue=Ge}else He.add(G);break e}else{if((i&1)===0){wp(p,ae,i),Hu();break e}G=Error(t(426))}}else if(Vt&&k.mode&1){var Zt=Tp(E);if(Zt!==null){(Zt.flags&65536)===0&&(Zt.flags|=256),bp(Zt,E,k,p,i),Qc(Is(G,k));break e}}p=G=Is(G,k),rn!==4&&(rn=2),Xo===null?Xo=[p]:Xo.push(p),p=E;do{switch(p.tag){case 3:p.flags|=65536,i&=-i,p.lanes|=i;var ee=Mp(p,G,i);qh(p,ee);break e;case 1:k=G;var W=p.type,re=p.stateNode;if((p.flags&128)===0&&(typeof W.getDerivedStateFromError=="function"||re!==null&&typeof re.componentDidCatch=="function"&&(xr===null||!xr.has(re)))){p.flags|=65536,i&=-i,p.lanes|=i;var we=Ep(p,k,i);qh(p,we);break e}}p=p.return}while(p!==null)}im(o)}catch($e){i=$e,Qt===o&&o!==null&&(Qt=o=o.return);continue}break}while(!0)}function tm(){var n=sl.current;return sl.current=Ja,n===null?Ja:n}function Hu(){(rn===0||rn===3||rn===2)&&(rn=4),ln===null||(Wr&268435455)===0&&(ol&268435455)===0||yr(ln,hn)}function fl(n,i){var o=wt;wt|=2;var c=tm();(ln!==n||hn!==i)&&(Gi=null,$r(n,i));do try{Fv();break}catch(f){em(n,f)}while(!0);if(eu(),wt=o,sl.current=c,Qt!==null)throw Error(t(261));return ln=null,hn=0,rn}function Fv(){for(;Qt!==null;)nm(Qt)}function kv(){for(;Qt!==null&&!K();)nm(Qt)}function nm(n){var i=om(n.alternate,n,Xn);n.memoizedProps=n.pendingProps,i===null?im(n):Qt=i,Lu.current=null}function im(n){var i=n;do{var o=i.alternate;if(n=i.return,(i.flags&32768)===0){if(o=Rv(o,i,Xn),o!==null){Qt=o;return}}else{if(o=Pv(o,i),o!==null){o.flags&=32767,Qt=o;return}if(n!==null)n.flags|=32768,n.subtreeFlags=0,n.deletions=null;else{rn=6,Qt=null;return}}if(i=i.sibling,i!==null){Qt=i;return}Qt=i=n}while(i!==null);rn===0&&(rn=5)}function Yr(n,i,o){var c=Nt,f=ti.transition;try{ti.transition=null,Nt=1,Ov(n,i,o,c)}finally{ti.transition=f,Nt=c}return null}function Ov(n,i,o,c){do Os();while(vr!==null);if((wt&6)!==0)throw Error(t(327));o=n.finishedWork;var f=n.finishedLanes;if(o===null)return null;if(n.finishedWork=null,n.finishedLanes=0,o===n.current)throw Error(t(177));n.callbackNode=null,n.callbackPriority=0;var p=o.lanes|o.childLanes;if(ya(n,p),n===ln&&(Qt=ln=null,hn=0),(o.subtreeFlags&2064)===0&&(o.flags&2064)===0||ll||(ll=!0,am(ot,function(){return Os(),null})),p=(o.flags&15990)!==0,(o.subtreeFlags&15990)!==0||p){p=ti.transition,ti.transition=null;var E=Nt;Nt=1;var k=wt;wt|=4,Lu.current=null,Lv(n,o),$p(o,n),rv(Hc),Ea=!!Bc,Hc=Bc=null,n.current=o,Dv(o),Te(),wt=k,Nt=E,ti.transition=p}else n.current=o;if(ll&&(ll=!1,vr=n,cl=f),p=n.pendingLanes,p===0&&(xr=null),mn(o.stateNode),Bn(n,Ee()),i!==null)for(c=n.onRecoverableError,o=0;o<i.length;o++)f=i[o],c(f.value,{componentStack:f.stack,digest:f.digest});if(al)throw al=!1,n=Uu,Uu=null,n;return(cl&1)!==0&&n.tag!==0&&Os(),p=n.pendingLanes,(p&1)!==0?n===Fu?$o++:($o=0,Fu=n):$o=0,hr(),null}function Os(){if(vr!==null){var n=Wf(cl),i=ti.transition,o=Nt;try{if(ti.transition=null,Nt=16>n?16:n,vr===null)var c=!1;else{if(n=vr,vr=null,cl=0,(wt&6)!==0)throw Error(t(331));var f=wt;for(wt|=4,Oe=n.current;Oe!==null;){var p=Oe,E=p.child;if((Oe.flags&16)!==0){var k=p.deletions;if(k!==null){for(var G=0;G<k.length;G++){var ae=k[G];for(Oe=ae;Oe!==null;){var _e=Oe;switch(_e.tag){case 0:case 11:case 15:jo(8,_e,p)}var ye=_e.child;if(ye!==null)ye.return=_e,Oe=ye;else for(;Oe!==null;){_e=Oe;var ge=_e.sibling,Ue=_e.return;if(Vp(_e),_e===ae){Oe=null;break}if(ge!==null){ge.return=Ue,Oe=ge;break}Oe=Ue}}}var He=p.alternate;if(He!==null){var Ge=He.child;if(Ge!==null){He.child=null;do{var Zt=Ge.sibling;Ge.sibling=null,Ge=Zt}while(Ge!==null)}}Oe=p}}if((p.subtreeFlags&2064)!==0&&E!==null)E.return=p,Oe=E;else e:for(;Oe!==null;){if(p=Oe,(p.flags&2048)!==0)switch(p.tag){case 0:case 11:case 15:jo(9,p,p.return)}var ee=p.sibling;if(ee!==null){ee.return=p.return,Oe=ee;break e}Oe=p.return}}var W=n.current;for(Oe=W;Oe!==null;){E=Oe;var re=E.child;if((E.subtreeFlags&2064)!==0&&re!==null)re.return=E,Oe=re;else e:for(E=W;Oe!==null;){if(k=Oe,(k.flags&2048)!==0)try{switch(k.tag){case 0:case 11:case 15:rl(9,k)}}catch($e){$t(k,k.return,$e)}if(k===E){Oe=null;break e}var we=k.sibling;if(we!==null){we.return=k.return,Oe=we;break e}Oe=k.return}}if(wt=f,hr(),St&&typeof St.onPostCommitFiberRoot=="function")try{St.onPostCommitFiberRoot(Ct,n)}catch{}c=!0}return c}finally{Nt=o,ti.transition=i}}return!1}function rm(n,i,o){i=Is(o,i),i=Mp(n,i,1),n=mr(n,i,1),i=Cn(),n!==null&&(Un(n,1,i),Bn(n,i))}function $t(n,i,o){if(n.tag===3)rm(n,n,o);else for(;i!==null;){if(i.tag===3){rm(i,n,o);break}else if(i.tag===1){var c=i.stateNode;if(typeof i.type.getDerivedStateFromError=="function"||typeof c.componentDidCatch=="function"&&(xr===null||!xr.has(c))){n=Is(o,n),n=Ep(i,n,1),i=mr(i,n,1),n=Cn(),i!==null&&(Un(i,1,n),Bn(i,n));break}}i=i.return}}function zv(n,i,o){var c=n.pingCache;c!==null&&c.delete(i),i=Cn(),n.pingedLanes|=n.suspendedLanes&o,ln===n&&(hn&o)===o&&(rn===4||rn===3&&(hn&130023424)===hn&&500>Ee()-Iu?$r(n,0):Du|=o),Bn(n,i)}function sm(n,i){i===0&&((n.mode&1)===0?i=1:(i=li,li<<=1,(li&130023424)===0&&(li=4194304)));var o=Cn();n=Bi(n,i),n!==null&&(Un(n,i,o),Bn(n,o))}function Bv(n){var i=n.memoizedState,o=0;i!==null&&(o=i.retryLane),sm(n,o)}function Hv(n,i){var o=0;switch(n.tag){case 13:var c=n.stateNode,f=n.memoizedState;f!==null&&(o=f.retryLane);break;case 19:c=n.stateNode;break;default:throw Error(t(314))}c!==null&&c.delete(i),sm(n,o)}var om;om=function(n,i,o){if(n!==null)if(n.memoizedProps!==i.pendingProps||Fn.current)On=!0;else{if((n.lanes&o)===0&&(i.flags&128)===0)return On=!1,Cv(n,i,o);On=(n.flags&131072)!==0}else On=!1,Vt&&(i.flags&1048576)!==0&&zh(i,Ha,i.index);switch(i.lanes=0,i.tag){case 2:var c=i.type;nl(n,i),n=i.pendingProps;var f=bs(i,xn.current);Ls(i,o),f=du(null,i,c,n,f,o);var p=fu();return i.flags|=1,typeof f=="object"&&f!==null&&typeof f.render=="function"&&f.$$typeof===void 0?(i.tag=1,i.memoizedState=null,i.updateQueue=null,kn(c)?(p=!0,Oa(i)):p=!1,i.memoizedState=f.state!==null&&f.state!==void 0?f.state:null,ru(i),f.updater=el,i.stateNode=f,f._reactInternals=i,vu(i,c,n,o),i=Mu(null,i,c,!0,p,o)):(i.tag=0,Vt&&p&&Yc(i),An(null,i,f,o),i=i.child),i;case 16:c=i.elementType;e:{switch(nl(n,i),n=i.pendingProps,f=c._init,c=f(c._payload),i.type=c,f=i.tag=Gv(c),n=di(c,n),f){case 0:i=Su(null,i,c,n,o);break e;case 1:i=Lp(null,i,c,n,o);break e;case 11:i=Ap(null,i,c,n,o);break e;case 14:i=Cp(null,i,c,di(c.type,n),o);break e}throw Error(t(306,c,""))}return i;case 0:return c=i.type,f=i.pendingProps,f=i.elementType===c?f:di(c,f),Su(n,i,c,f,o);case 1:return c=i.type,f=i.pendingProps,f=i.elementType===c?f:di(c,f),Lp(n,i,c,f,o);case 3:e:{if(Dp(i),n===null)throw Error(t(387));c=i.pendingProps,p=i.memoizedState,f=p.element,Yh(n,i),$a(i,c,null,o);var E=i.memoizedState;if(c=E.element,p.isDehydrated)if(p={element:c,isDehydrated:!1,cache:E.cache,pendingSuspenseBoundaries:E.pendingSuspenseBoundaries,transitions:E.transitions},i.updateQueue.baseState=p,i.memoizedState=p,i.flags&256){f=Is(Error(t(423)),i),i=Ip(n,i,c,o,f);break e}else if(c!==f){f=Is(Error(t(424)),i),i=Ip(n,i,c,o,f);break e}else for(Wn=ur(i.stateNode.containerInfo.firstChild),jn=i,Vt=!0,ui=null,o=Xh(i,null,c,o),i.child=o;o;)o.flags=o.flags&-3|4096,o=o.sibling;else{if(Rs(),c===f){i=Vi(n,i,o);break e}An(n,i,c,o)}i=i.child}return i;case 5:return Kh(i),n===null&&Kc(i),c=i.type,f=i.pendingProps,p=n!==null?n.memoizedProps:null,E=f.children,Vc(c,f)?E=null:p!==null&&Vc(c,p)&&(i.flags|=32),Np(n,i),An(n,i,E,o),i.child;case 6:return n===null&&Kc(i),null;case 13:return Up(n,i,o);case 4:return su(i,i.stateNode.containerInfo),c=i.pendingProps,n===null?i.child=Ps(i,null,c,o):An(n,i,c,o),i.child;case 11:return c=i.type,f=i.pendingProps,f=i.elementType===c?f:di(c,f),Ap(n,i,c,f,o);case 7:return An(n,i,i.pendingProps,o),i.child;case 8:return An(n,i,i.pendingProps.children,o),i.child;case 12:return An(n,i,i.pendingProps.children,o),i.child;case 10:e:{if(c=i.type._context,f=i.pendingProps,p=i.memoizedProps,E=f.value,kt(ja,c._currentValue),c._currentValue=E,p!==null)if(ci(p.value,E)){if(p.children===f.children&&!Fn.current){i=Vi(n,i,o);break e}}else for(p=i.child,p!==null&&(p.return=i);p!==null;){var k=p.dependencies;if(k!==null){E=p.child;for(var G=k.firstContext;G!==null;){if(G.context===c){if(p.tag===1){G=Hi(-1,o&-o),G.tag=2;var ae=p.updateQueue;if(ae!==null){ae=ae.shared;var _e=ae.pending;_e===null?G.next=G:(G.next=_e.next,_e.next=G),ae.pending=G}}p.lanes|=o,G=p.alternate,G!==null&&(G.lanes|=o),nu(p.return,o,i),k.lanes|=o;break}G=G.next}}else if(p.tag===10)E=p.type===i.type?null:p.child;else if(p.tag===18){if(E=p.return,E===null)throw Error(t(341));E.lanes|=o,k=E.alternate,k!==null&&(k.lanes|=o),nu(E,o,i),E=p.sibling}else E=p.child;if(E!==null)E.return=p;else for(E=p;E!==null;){if(E===i){E=null;break}if(p=E.sibling,p!==null){p.return=E.return,E=p;break}E=E.return}p=E}An(n,i,f.children,o),i=i.child}return i;case 9:return f=i.type,c=i.pendingProps.children,Ls(i,o),f=Jn(f),c=c(f),i.flags|=1,An(n,i,c,o),i.child;case 14:return c=i.type,f=di(c,i.pendingProps),f=di(c.type,f),Cp(n,i,c,f,o);case 15:return Rp(n,i,i.type,i.pendingProps,o);case 17:return c=i.type,f=i.pendingProps,f=i.elementType===c?f:di(c,f),nl(n,i),i.tag=1,kn(c)?(n=!0,Oa(i)):n=!1,Ls(i,o),yp(i,c,f),vu(i,c,f,o),Mu(null,i,c,!0,n,o);case 19:return kp(n,i,o);case 22:return Pp(n,i,o)}throw Error(t(156,i.tag))};function am(n,i){return le(n,i)}function Vv(n,i,o,c){this.tag=n,this.key=o,this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null,this.index=0,this.ref=null,this.pendingProps=i,this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null,this.mode=c,this.subtreeFlags=this.flags=0,this.deletions=null,this.childLanes=this.lanes=0,this.alternate=null}function ni(n,i,o,c){return new Vv(n,i,o,c)}function Vu(n){return n=n.prototype,!(!n||!n.isReactComponent)}function Gv(n){if(typeof n=="function")return Vu(n)?1:0;if(n!=null){if(n=n.$$typeof,n===te)return 11;if(n===ce)return 14}return 2}function Sr(n,i){var o=n.alternate;return o===null?(o=ni(n.tag,i,n.key,n.mode),o.elementType=n.elementType,o.type=n.type,o.stateNode=n.stateNode,o.alternate=n,n.alternate=o):(o.pendingProps=i,o.type=n.type,o.flags=0,o.subtreeFlags=0,o.deletions=null),o.flags=n.flags&14680064,o.childLanes=n.childLanes,o.lanes=n.lanes,o.child=n.child,o.memoizedProps=n.memoizedProps,o.memoizedState=n.memoizedState,o.updateQueue=n.updateQueue,i=n.dependencies,o.dependencies=i===null?null:{lanes:i.lanes,firstContext:i.firstContext},o.sibling=n.sibling,o.index=n.index,o.ref=n.ref,o}function hl(n,i,o,c,f,p){var E=2;if(c=n,typeof n=="function")Vu(n)&&(E=1);else if(typeof n=="string")E=5;else e:switch(n){case F:return qr(o.children,f,p,i);case B:E=8,f|=8;break;case P:return n=ni(12,o,i,f|2),n.elementType=P,n.lanes=p,n;case J:return n=ni(13,o,i,f),n.elementType=J,n.lanes=p,n;case oe:return n=ni(19,o,i,f),n.elementType=oe,n.lanes=p,n;case Q:return pl(o,f,p,i);default:if(typeof n=="object"&&n!==null)switch(n.$$typeof){case A:E=10;break e;case H:E=9;break e;case te:E=11;break e;case ce:E=14;break e;case j:E=16,c=null;break e}throw Error(t(130,n==null?n:typeof n,""))}return i=ni(E,o,i,f),i.elementType=n,i.type=c,i.lanes=p,i}function qr(n,i,o,c){return n=ni(7,n,c,i),n.lanes=o,n}function pl(n,i,o,c){return n=ni(22,n,c,i),n.elementType=Q,n.lanes=o,n.stateNode={isHidden:!1},n}function Gu(n,i,o){return n=ni(6,n,null,i),n.lanes=o,n}function ju(n,i,o){return i=ni(4,n.children!==null?n.children:[],n.key,i),i.lanes=o,i.stateNode={containerInfo:n.containerInfo,pendingChildren:null,implementation:n.implementation},i}function jv(n,i,o,c,f){this.tag=i,this.containerInfo=n,this.finishedWork=this.pingCache=this.current=this.pendingChildren=null,this.timeoutHandle=-1,this.callbackNode=this.pendingContext=this.context=null,this.callbackPriority=0,this.eventTimes=Zn(0),this.expirationTimes=Zn(-1),this.entangledLanes=this.finishedLanes=this.mutableReadLanes=this.expiredLanes=this.pingedLanes=this.suspendedLanes=this.pendingLanes=0,this.entanglements=Zn(0),this.identifierPrefix=c,this.onRecoverableError=f,this.mutableSourceEagerHydrationData=null}function Wu(n,i,o,c,f,p,E,k,G){return n=new jv(n,i,o,k,G),i===1?(i=1,p===!0&&(i|=8)):i=0,p=ni(3,null,null,i),n.current=p,p.stateNode=n,p.memoizedState={element:c,isDehydrated:o,cache:null,transitions:null,pendingSuspenseBoundaries:null},ru(p),n}function Wv(n,i,o){var c=3<arguments.length&&arguments[3]!==void 0?arguments[3]:null;return{$$typeof:D,key:c==null?null:""+c,children:n,containerInfo:i,implementation:o}}function lm(n){if(!n)return fr;n=n._reactInternals;e:{if(Ei(n)!==n||n.tag!==1)throw Error(t(170));var i=n;do{switch(i.tag){case 3:i=i.stateNode.context;break e;case 1:if(kn(i.type)){i=i.stateNode.__reactInternalMemoizedMergedChildContext;break e}}i=i.return}while(i!==null);throw Error(t(171))}if(n.tag===1){var o=n.type;if(kn(o))return Fh(n,o,i)}return i}function cm(n,i,o,c,f,p,E,k,G){return n=Wu(o,c,!0,n,f,p,E,k,G),n.context=lm(null),o=n.current,c=Cn(),f=_r(o),p=Hi(c,f),p.callback=i??null,mr(o,p,f),n.current.lanes=f,Un(n,f,c),Bn(n,c),n}function ml(n,i,o,c){var f=i.current,p=Cn(),E=_r(f);return o=lm(o),i.context===null?i.context=o:i.pendingContext=o,i=Hi(p,E),i.payload={element:n},c=c===void 0?null:c,c!==null&&(i.callback=c),n=mr(f,i,E),n!==null&&(pi(n,f,E,p),Xa(n,f,E)),E}function gl(n){if(n=n.current,!n.child)return null;switch(n.child.tag){case 5:return n.child.stateNode;default:return n.child.stateNode}}function um(n,i){if(n=n.memoizedState,n!==null&&n.dehydrated!==null){var o=n.retryLane;n.retryLane=o!==0&&o<i?o:i}}function Xu(n,i){um(n,i),(n=n.alternate)&&um(n,i)}function Xv(){return null}var dm=typeof reportError=="function"?reportError:function(n){console.error(n)};function $u(n){this._internalRoot=n}xl.prototype.render=$u.prototype.render=function(n){var i=this._internalRoot;if(i===null)throw Error(t(409));ml(n,i,null,null)},xl.prototype.unmount=$u.prototype.unmount=function(){var n=this._internalRoot;if(n!==null){this._internalRoot=null;var i=n.containerInfo;Xr(function(){ml(null,n,null,null)}),i[Fi]=null}};function xl(n){this._internalRoot=n}xl.prototype.unstable_scheduleHydration=function(n){if(n){var i=Yf();n={blockedOn:null,target:n,priority:i};for(var o=0;o<ar.length&&i!==0&&i<ar[o].priority;o++);ar.splice(o,0,n),o===0&&Kf(n)}};function Yu(n){return!(!n||n.nodeType!==1&&n.nodeType!==9&&n.nodeType!==11)}function vl(n){return!(!n||n.nodeType!==1&&n.nodeType!==9&&n.nodeType!==11&&(n.nodeType!==8||n.nodeValue!==" react-mount-point-unstable "))}function fm(){}function $v(n,i,o,c,f){if(f){if(typeof c=="function"){var p=c;c=function(){var ae=gl(E);p.call(ae)}}var E=cm(i,c,n,0,null,!1,!1,"",fm);return n._reactRootContainer=E,n[Fi]=E.current,No(n.nodeType===8?n.parentNode:n),Xr(),E}for(;f=n.lastChild;)n.removeChild(f);if(typeof c=="function"){var k=c;c=function(){var ae=gl(G);k.call(ae)}}var G=Wu(n,0,!1,null,null,!1,!1,"",fm);return n._reactRootContainer=G,n[Fi]=G.current,No(n.nodeType===8?n.parentNode:n),Xr(function(){ml(i,G,o,c)}),G}function _l(n,i,o,c,f){var p=o._reactRootContainer;if(p){var E=p;if(typeof f=="function"){var k=f;f=function(){var G=gl(E);k.call(G)}}ml(i,E,n,f)}else E=$v(o,i,n,f,c);return gl(E)}Xf=function(n){switch(n.tag){case 3:var i=n.stateNode;if(i.current.memoizedState.isDehydrated){var o=tn(i.pendingLanes);o!==0&&(vc(i,o|1),Bn(i,Ee()),(wt&6)===0&&(ks=Ee()+500,hr()))}break;case 13:Xr(function(){var c=Bi(n,1);if(c!==null){var f=Cn();pi(c,n,1,f)}}),Xu(n,1)}},_c=function(n){if(n.tag===13){var i=Bi(n,134217728);if(i!==null){var o=Cn();pi(i,n,134217728,o)}Xu(n,134217728)}},$f=function(n){if(n.tag===13){var i=_r(n),o=Bi(n,i);if(o!==null){var c=Cn();pi(o,n,i,c)}Xu(n,i)}},Yf=function(){return Nt},qf=function(n,i){var o=Nt;try{return Nt=n,i()}finally{Nt=o}},Pe=function(n,i,o){switch(i){case"input":if(xt(n,o),i=o.name,o.type==="radio"&&i!=null){for(o=n;o.parentNode;)o=o.parentNode;for(o=o.querySelectorAll("input[name="+JSON.stringify(""+i)+'][type="radio"]'),i=0;i<o.length;i++){var c=o[i];if(c!==n&&c.form===n.form){var f=Fa(c);if(!f)throw Error(t(90));Ke(c),xt(c,f)}}}break;case"textarea":me(n,o);break;case"select":i=o.value,i!=null&&U(n,!!o.multiple,i,!1)}},Ot=zu,en=Xr;var Yv={usingClientEntryPoint:!1,Events:[Io,ws,Fa,Le,lt,zu]},Yo={findFiberByHostInstance:Or,bundleType:0,version:"18.3.1",rendererPackageName:"react-dom"},qv={bundleType:Yo.bundleType,version:Yo.version,rendererPackageName:Yo.rendererPackageName,rendererConfig:Yo.rendererConfig,overrideHookState:null,overrideHookStateDeletePath:null,overrideHookStateRenamePath:null,overrideProps:null,overridePropsDeletePath:null,overridePropsRenamePath:null,setErrorHandler:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:w.ReactCurrentDispatcher,findHostInstanceByFiber:function(n){return n=R(n),n===null?null:n.stateNode},findFiberByHostInstance:Yo.findFiberByHostInstance||Xv,findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null,reconcilerVersion:"18.3.1-next-f1338f8080-20240426"};if(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__<"u"){var yl=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(!yl.isDisabled&&yl.supportsFiber)try{Ct=yl.inject(qv),St=yl}catch{}}return Hn.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=Yv,Hn.createPortal=function(n,i){var o=2<arguments.length&&arguments[2]!==void 0?arguments[2]:null;if(!Yu(i))throw Error(t(200));return Wv(n,i,null,o)},Hn.createRoot=function(n,i){if(!Yu(n))throw Error(t(299));var o=!1,c="",f=dm;return i!=null&&(i.unstable_strictMode===!0&&(o=!0),i.identifierPrefix!==void 0&&(c=i.identifierPrefix),i.onRecoverableError!==void 0&&(f=i.onRecoverableError)),i=Wu(n,1,!1,null,null,o,!1,c,f),n[Fi]=i.current,No(n.nodeType===8?n.parentNode:n),new $u(i)},Hn.findDOMNode=function(n){if(n==null)return null;if(n.nodeType===1)return n;var i=n._reactInternals;if(i===void 0)throw typeof n.render=="function"?Error(t(188)):(n=Object.keys(n).join(","),Error(t(268,n)));return n=R(i),n=n===null?null:n.stateNode,n},Hn.flushSync=function(n){return Xr(n)},Hn.hydrate=function(n,i,o){if(!vl(i))throw Error(t(200));return _l(null,n,i,!0,o)},Hn.hydrateRoot=function(n,i,o){if(!Yu(n))throw Error(t(405));var c=o!=null&&o.hydratedSources||null,f=!1,p="",E=dm;if(o!=null&&(o.unstable_strictMode===!0&&(f=!0),o.identifierPrefix!==void 0&&(p=o.identifierPrefix),o.onRecoverableError!==void 0&&(E=o.onRecoverableError)),i=cm(i,null,n,1,o??null,f,!1,p,E),n[Fi]=i.current,No(n),c)for(n=0;n<c.length;n++)o=c[n],f=o._getVersion,f=f(o._source),i.mutableSourceEagerHydrationData==null?i.mutableSourceEagerHydrationData=[o,f]:i.mutableSourceEagerHydrationData.push(o,f);return new xl(i)},Hn.render=function(n,i,o){if(!vl(i))throw Error(t(200));return _l(null,n,i,!1,o)},Hn.unmountComponentAtNode=function(n){if(!vl(n))throw Error(t(40));return n._reactRootContainer?(Xr(function(){_l(null,null,n,!1,function(){n._reactRootContainer=null,n[Fi]=null})}),!0):!1},Hn.unstable_batchedUpdates=zu,Hn.unstable_renderSubtreeIntoContainer=function(n,i,o,c){if(!vl(o))throw Error(t(200));if(n==null||n._reactInternals===void 0)throw Error(t(38));return _l(n,i,o,!1,c)},Hn.version="18.3.1-next-f1338f8080-20240426",Hn}var ym;function r_(){if(ym)return Ku.exports;ym=1;function s(){if(!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__>"u"||typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE!="function"))try{__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(s)}catch(e){console.error(e)}}return s(),Ku.exports=i_(),Ku.exports}var Sm;function s_(){if(Sm)return Sl;Sm=1;var s=r_();return Sl.createRoot=s.createRoot,Sl.hydrateRoot=s.hydrateRoot,Sl}var o_=s_();const a_=B0(o_);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l_=s=>s?.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function c_(s,e,t=[]){if(e==null)throw new Error("[lucide]: iconNode is required when icon name is used");return{name:l_(s),size:24,node:e,...t.length>0?{aliases:t}:{}}}/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u_=s=>{let e="",t=!1;for(const r of s){if(r==="-"||r==="_"||r<=" "){t=e.length>0;continue}e.length===0?e+=r.toLowerCase():e+=t?r.toUpperCase():r,t=!1}return e};/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d_=s=>{const e=u_(s);return e.charAt(0).toUpperCase()+e.slice(1)};/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Fd=(...s)=>s.filter((e,t,r)=>!!e&&e.trim()!==""&&r.indexOf(e)===t).join(" ").trim();/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Zr={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function ed(s){return s!=null}function f_(s,e={}){const t=e.attributeNames??{},r=v=>t[v]??v,a=s.size??s.width??Zr.width,l=s.size??s.height??Zr.height,u=s.aliases?.filter(v=>typeof v=="string"&&v.trim()!=="").map(v=>`lucide-${v}`)??[],d=[...s.name?[`lucide-${s.name}`]:[],...u],h=e.className?.split(" ").filter(Boolean)??[],m=e.includeDefaultClasses===!1?Fd(...h):Fd("lucide",...d,...h),g=e.absoluteStrokeWidth?Number(e.strokeWidth??Zr["stroke-width"])*Number(s.size??s.width??Zr.width)/Number(e.size??e.width??Zr.width):e.strokeWidth??Zr["stroke-width"];return["svg",{...Object.entries(Zr).reduce((v,[M,T])=>(v[r(M)]=T,v),{}),..."color"in e&&e.color&&{[r("stroke")]:e.color},..."size"in e&&ed(e.size)&&{[r("width")]:e.size,[r("height")]:e.size},..."width"in e&&ed(e.width)&&{[r("width")]:e.width},..."height"in e&&ed(e.height)&&{[r("height")]:e.height},[r("stroke-width")]:g,...m&&{[r("class")]:m},[r("viewBox")]:`0 0 ${a} ${l}`,...e.hasA11yProp===!1?{[r("aria-hidden")]:"true"}:{},..."attributes"in e&&e.attributes},s.node.map(v=>{const[M,T,b]=v,y=e.nonScalingStroke?{[r("vector-effect")]:"non-scaling-stroke",...T}:T;return b?[M,y,b]:[M,y]})]}/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function h_(s,e={}){return f_(s,{...e,attributeNames:{...e.attributeNames,class:"className","stroke-width":"strokeWidth","stroke-linecap":"strokeLinecap","stroke-linejoin":"strokeLinejoin","vector-effect":"vectorEffect"}})}/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p_=s=>{for(const e in s)if(e.startsWith("aria-")||e==="role"||e==="title")return!0;return!1},m_=nt.createContext({}),g_=()=>nt.useContext(m_),x_=nt.forwardRef(({color:s,size:e,width:t,height:r,strokeWidth:a,absoluteStrokeWidth:l,nonScalingStroke:u,className:d="",children:h,iconNode:m=[],icon:g={node:m,aliases:[],size:24},..._},v)=>{const{size:M=24,strokeWidth:T=2,absoluteStrokeWidth:b=!1,nonScalingStroke:y=!1,color:x="currentColor",className:L=""}=g_()??{},N=!!h||p_(_),[w,O,D=[]]=h_(g,{color:s??x,width:t??e??M,height:r??e??M,strokeWidth:a??T,absoluteStrokeWidth:l??b,nonScalingStroke:u??y,className:Fd(L,d),hasA11yProp:N,attributes:_});return nt.createElement(w,{ref:v,...O},[...D.map(([F,B])=>nt.createElement(F,B)),...Array.isArray(h)?h:[h]])});/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */function dt(s,e=[],t=[]){const r=typeof s=="string"?c_(s,e,t):s,a=nt.forwardRef(({className:l,...u},d)=>nt.createElement(x_,{ref:d,icon:r,className:l,...u}));return r.name&&(a.displayName=d_(r.name)),a}/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H0={name:"arrow-up-right",size:24,node:[["path",{d:"M7 7h10v10",key:"1tivn9"}],["path",{d:"M7 17 17 7",key:"1vkiza"}]]};H0.node;const v_=dt(H0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const V0={name:"box",size:24,node:[["path",{d:"M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",key:"hh9hay"}],["path",{d:"m3.3 7 8.7 5 8.7-5",key:"g66t2b"}],["path",{d:"M12 22V12",key:"d0xqtd"}]]};V0.node;const rc=dt(V0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G0={name:"check",size:24,node:[["path",{d:"M20 6 9 17l-5-5",key:"1gmf2c"}]]};G0.node;const __=dt(G0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j0={name:"circle-dot",size:24,node:[["circle",{cx:"12",cy:"12",r:"1",key:"41hilf"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]]};j0.node;const y_=dt(j0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W0={name:"circle",size:24,node:[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]]};W0.node;const S_=dt(W0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const X0={name:"code-xml",size:24,node:[["path",{d:"m18 16 4-4-4-4",key:"1inbqp"}],["path",{d:"m6 8-4 4 4 4",key:"15zrgr"}],["path",{d:"m14.5 4-5 16",key:"e7oirm"}]],aliases:["code-2"]};X0.node;const M_=dt(X0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $0={name:"compass",size:24,node:[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",key:"9ktpf1"}]]};$0.node;const Y0=dt($0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const q0={name:"copy",size:24,node:[["rect",{width:"14",height:"14",x:"8",y:"8",rx:"2",ry:"2",key:"17jyea"}],["path",{d:"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",key:"zix9uf"}]]};q0.node;const E_=dt(q0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Z0={name:"cpu",size:24,node:[["path",{d:"M12 20v2",key:"1lh1kg"}],["path",{d:"M12 2v2",key:"tus03m"}],["path",{d:"M17 20v2",key:"1rnc9c"}],["path",{d:"M17 2v2",key:"11trls"}],["path",{d:"M2 12h2",key:"1t8f8n"}],["path",{d:"M2 17h2",key:"7oei6x"}],["path",{d:"M2 7h2",key:"asdhe0"}],["path",{d:"M20 12h2",key:"1q8mjw"}],["path",{d:"M20 17h2",key:"1fpfkl"}],["path",{d:"M20 7h2",key:"1o8tra"}],["path",{d:"M7 20v2",key:"4gnj0m"}],["path",{d:"M7 2v2",key:"1i4yhu"}],["rect",{x:"4",y:"4",width:"16",height:"16",rx:"2",key:"1vbyd7"}],["rect",{x:"8",y:"8",width:"8",height:"8",rx:"1",key:"z9xiuo"}]]};Z0.node;const uc=dt(Z0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K0={name:"download",size:24,node:[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]]};K0.node;const w_=dt(K0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Q0={name:"droplet",size:24,node:[["path",{d:"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",key:"c7niix"}]]};Q0.node;const kd=dt(Q0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const J0={name:"eye-off",size:24,node:[["path",{d:"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49",key:"ct8e1f"}],["path",{d:"M14.084 14.158a3 3 0 0 1-4.242-4.242",key:"151rxh"}],["path",{d:"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143",key:"13bj9a"}],["path",{d:"m2 2 20 20",key:"1ooewy"}]]};J0.node;const T_=dt(J0);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const eg={name:"eye",size:24,node:[["path",{d:"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0",key:"1nclc0"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]};eg.node;const b_=dt(eg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const tg={name:"file-code",size:24,node:[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 12.5 8 15l2 2.5",key:"1tg20x"}],["path",{d:"m14 12.5 2 2.5-2 2.5",key:"yinavb"}]]};tg.node;const A_=dt(tg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ng={name:"git-branch",size:24,node:[["path",{d:"M15 6a9 9 0 0 0-9 9V3",key:"1cii5b"}],["circle",{cx:"18",cy:"6",r:"3",key:"1h7g24"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}]]};ng.node;const C_=dt(ng);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ig={name:"globe",size:24,node:[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20",key:"13o1zl"}],["path",{d:"M2 12h20",key:"9i4pu4"}]]};ig.node;const R_=dt(ig);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const rg={name:"grid-3x3",size:24,node:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}],["path",{d:"M3 9h18",key:"1pudct"}],["path",{d:"M3 15h18",key:"5xshup"}],["path",{d:"M9 3v18",key:"fh3hqa"}],["path",{d:"M15 3v18",key:"14nvp0"}]],aliases:["grid","grid-3-x-3"]};rg.node;const P_=dt(rg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const sg={name:"layers",size:24,node:[["path",{d:"M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z",key:"zw3jo"}],["path",{d:"M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12",key:"1wduqc"}],["path",{d:"M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17",key:"kqbvx6"}]],aliases:["layers-3"]};sg.node;const Nf=dt(sg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const og={name:"loader-circle",size:24,node:[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]],aliases:["loader-2"]};og.node;const N_=dt(og);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ag={name:"maximize-2",size:24,node:[["path",{d:"M15 3h6v6",key:"1q9fwt"}],["path",{d:"m21 3-7 7",key:"1l2asr"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M9 21H3v-6",key:"wtvkvv"}]]};ag.node;const lg=dt(ag);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const cg={name:"maximize",size:24,node:[["path",{d:"M8 3H5a2 2 0 0 0-2 2v3",key:"1dcmit"}],["path",{d:"M21 8V5a2 2 0 0 0-2-2h-3",key:"1e4gt3"}],["path",{d:"M3 16v3a2 2 0 0 0 2 2h3",key:"wsl5sc"}],["path",{d:"M16 21h3a2 2 0 0 0 2-2v-3",key:"18trek"}]]};cg.node;const L_=dt(cg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ug={name:"minimize-2",size:24,node:[["path",{d:"m14 10 7-7",key:"oa77jy"}],["path",{d:"M20 10h-6V4",key:"mjg0md"}],["path",{d:"m3 21 7-7",key:"tjx5ai"}],["path",{d:"M4 14h6v6",key:"rmj7iw"}]]};ug.node;const D_=dt(ug);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const dg={name:"monitor",size:24,node:[["rect",{width:"20",height:"14",x:"2",y:"3",rx:"2",key:"48i651"}],["line",{x1:"8",x2:"16",y1:"21",y2:"21",key:"1svkeh"}],["line",{x1:"12",x2:"12",y1:"17",y2:"21",key:"vw1qmm"}]]};dg.node;const I_=dt(dg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const fg={name:"move-3d",size:24,node:[["path",{d:"M5 3v16h16",key:"1mqmf9"}],["path",{d:"m5 19 6-6",key:"jh6hbb"}],["path",{d:"m2 6 3-3 3 3",key:"tkyvxa"}],["path",{d:"m18 16 3 3-3 3",key:"1d4glt"}]],aliases:["move-3-d"]};fg.node;const U_=dt(fg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const hg={name:"move",size:24,node:[["path",{d:"M12 2v20",key:"t6zp3m"}],["path",{d:"m15 19-3 3-3-3",key:"11eu04"}],["path",{d:"m19 9 3 3-3 3",key:"1mg7y2"}],["path",{d:"M2 12h20",key:"9i4pu4"}],["path",{d:"m5 9-3 3 3 3",key:"j64kie"}],["path",{d:"m9 5 3-3 3 3",key:"l8vdw6"}]]};hg.node;const pg=dt(hg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const mg={name:"palette",size:24,node:[["path",{d:"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z",key:"e79jfc"}],["circle",{cx:"13.5",cy:"6.5",r:".5",fill:"currentColor",key:"1okk4w"}],["circle",{cx:"17.5",cy:"10.5",r:".5",fill:"currentColor",key:"f64h9f"}],["circle",{cx:"6.5",cy:"12.5",r:".5",fill:"currentColor",key:"qy21gx"}],["circle",{cx:"8.5",cy:"7.5",r:".5",fill:"currentColor",key:"fotxhn"}]]};mg.node;const gg=dt(mg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xg={name:"pause",size:24,node:[["rect",{x:"14",y:"3",width:"5",height:"18",rx:"1",key:"kaeet6"}],["rect",{x:"5",y:"3",width:"5",height:"18",rx:"1",key:"1wsw3u"}]]};xg.node;const Lf=dt(xg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const vg={name:"play",size:24,node:[["path",{d:"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z",key:"10ikf1"}]]};vg.node;const fa=dt(vg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _g={name:"rotate-ccw",size:24,node:[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]]};_g.node;const F_=dt(_g);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const yg={name:"rotate-cw",size:24,node:[["path",{d:"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",key:"1p45f6"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}]]};yg.node;const Sg=dt(yg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Mg={name:"scale",size:24,node:[["path",{d:"M12 3v18",key:"108xh3"}],["path",{d:"m19 8 3 8a5 5 0 0 1-6 0zV7",key:"zcdpyk"}],["path",{d:"M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1",key:"1yorad"}],["path",{d:"m5 8 3 8a5 5 0 0 1-6 0zV7",key:"eua70x"}],["path",{d:"M7 21h10",key:"1b0cd5"}]]};Mg.node;const k_=dt(Mg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Eg={name:"scissors",size:24,node:[["circle",{cx:"6",cy:"6",r:"3",key:"1lh9wr"}],["path",{d:"M8.12 8.12 12 12",key:"1alkpv"}],["path",{d:"M20 4 8.12 15.88",key:"xgtan2"}],["circle",{cx:"6",cy:"18",r:"3",key:"fqmcym"}],["path",{d:"M14.8 14.8 20 20",key:"ptml3r"}]]};Eg.node;const O_=dt(Eg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const wg={name:"skip-back",size:24,node:[["path",{d:"M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432z",key:"15892j"}],["path",{d:"M3 20V4",key:"1ptbpl"}]]};wg.node;const z_=dt(wg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Tg={name:"skip-forward",size:24,node:[["path",{d:"M21 4v16",key:"7j8fe9"}],["path",{d:"M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432z",key:"zs4d6"}]]};Tg.node;const B_=dt(Tg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const bg={name:"sliders-vertical",size:24,node:[["path",{d:"M10 8h4",key:"1sr2af"}],["path",{d:"M12 21v-9",key:"17s77i"}],["path",{d:"M12 8V3",key:"13r4qs"}],["path",{d:"M17 16h4",key:"h1uq16"}],["path",{d:"M19 12V3",key:"o1uvq1"}],["path",{d:"M19 21v-5",key:"qua636"}],["path",{d:"M3 14h4",key:"bcjad9"}],["path",{d:"M5 10V3",key:"cb8scm"}],["path",{d:"M5 21v-7",key:"1w1uti"}]],aliases:["sliders"]};bg.node;const Od=dt(bg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ag={name:"sparkles",size:24,node:[["path",{d:"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",key:"1s2grr"}],["path",{d:"M20 2v4",key:"1rf3ol"}],["path",{d:"M22 4h-4",key:"gwowj6"}],["circle",{cx:"4",cy:"20",r:"2",key:"6kqj1y"}]],aliases:["stars"]};Ag.node;const zd=dt(Ag);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Cg={name:"square",size:24,node:[["rect",{width:"18",height:"18",x:"3",y:"3",rx:"2",key:"afitv7"}]]};Cg.node;const Rg=dt(Cg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pg={name:"trash",size:24,node:[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],aliases:["trash-2"]};Pg.node;const H_=dt(Pg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ng={name:"wand-sparkles",size:24,node:[["path",{d:"m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72",key:"ul74o6"}],["path",{d:"m14 7 3 3",key:"1r5n42"}],["path",{d:"M5 6v4",key:"ilb8ba"}],["path",{d:"M19 14v4",key:"blhpug"}],["path",{d:"M10 2v2",key:"7u0qdc"}],["path",{d:"M7 8H3",key:"zfb6yr"}],["path",{d:"M21 16h-4",key:"1cnmox"}],["path",{d:"M11 3H9",key:"1obp7u"}]],aliases:["wand-2"]};Ng.node;const V_=dt(Ng);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Lg={name:"zap",size:24,node:[["path",{d:"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z",key:"1v7up4"}]]};Lg.node;const G_=dt(Lg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Dg={name:"zoom-in",size:24,node:[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"11",x2:"11",y1:"8",y2:"14",key:"1vmskp"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]]};Dg.node;const j_=dt(Dg);/**
 * @license lucide-react v1.61.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ig={name:"zoom-out",size:24,node:[["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}],["line",{x1:"21",x2:"16.65",y1:"21",y2:"16.65",key:"13gj7c"}],["line",{x1:"8",x2:"14",y1:"11",y2:"11",key:"durymu"}]]};Ig.node;const W_=dt(Ig),X_=({currentMode:s,onSelectMode:e,onExport:t,onAddPrimitive:r})=>{const a=[{id:"mesh",label:"Mesh & Sculpt",icon:S.jsx(Nf,{className:"w-4 h-4"}),badge:"Blender",desc:"Polygon modeling, sculpting & nodes"},{id:"interactive",label:"Interactive 3D",icon:S.jsx(fa,{className:"w-4 h-4"}),badge:"Spline",desc:"Physics, events & triggers"},{id:"voxel",label:"Box & Voxel",icon:S.jsx(rc,{className:"w-4 h-4"}),badge:"Blockbench",desc:"Cube hierarchy & pixel textures"},{id:"cad",label:"Parametric CAD",icon:S.jsx(uc,{className:"w-4 h-4"}),badge:"FreeCAD",desc:"2D sketch & parametric features"},{id:"scad",label:"Code CAD",icon:S.jsx(M_,{className:"w-4 h-4"}),badge:"OpenSCAD",desc:"Script-driven CSG solid modeling"},{id:"sdf",label:"Liquid Clay",icon:S.jsx(kd,{className:"w-4 h-4"}),badge:"Womp",desc:"Real-time soft SDF boolean modeling"},{id:"ai",label:"AI Generator",icon:S.jsx(zd,{className:"w-4 h-4"}),badge:"Meshy",desc:"Text-to-3D & AI texture synthesis"}];return S.jsxs("header",{className:"h-14 bg-studio-900 border-b border-studio-800 flex items-center justify-between px-3 z-30 select-none",children:[S.jsxs("div",{className:"flex items-center gap-3",children:[S.jsxs("div",{className:"flex items-center gap-2 pr-3 border-r border-studio-800",children:[S.jsx("div",{className:"w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20",children:S.jsx(rc,{className:"w-5 h-5 text-white"})}),S.jsxs("div",{children:[S.jsx("span",{className:"font-bold text-sm bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent",children:"Omni3D"}),S.jsx("span",{className:"text-[10px] text-slate-400 block leading-none font-mono",children:"STUDIO v0.1"})]})]}),S.jsxs("div",{className:"hidden sm:flex items-center gap-1",children:[S.jsx("button",{onClick:()=>r("cube"),className:"px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1",title:"Add Cube",children:"+ Cube"}),S.jsx("button",{onClick:()=>r("sphere"),className:"px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1",title:"Add Sphere",children:"+ Sphere"}),S.jsx("button",{onClick:()=>r("cylinder"),className:"px-2.5 py-1 text-xs rounded hover:bg-studio-800 text-slate-300 transition-colors flex items-center gap-1",title:"Add Cylinder",children:"+ Cylinder"})]})]}),S.jsx("div",{className:"flex items-center bg-studio-950/80 p-1 rounded-xl border border-studio-800/80 max-w-2xl overflow-x-auto scrollbar-none",children:a.map(l=>{const u=s===l.id;return S.jsxs("button",{onClick:()=>e(l.id),className:`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${u?"bg-studio-800 text-blue-400 shadow-sm border border-blue-500/30":"text-slate-400 hover:text-slate-200 hover:bg-studio-900/60"}`,title:l.desc,children:[l.icon,S.jsx("span",{children:l.label}),S.jsx("span",{className:`text-[9px] px-1.5 py-0.2 rounded font-mono ${u?"bg-blue-500/20 text-blue-300":"bg-studio-800 text-slate-500"}`,children:l.badge})]},l.id)})}),S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsxs("div",{className:"relative group",children:[S.jsxs("button",{className:"flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md shadow-blue-600/20 transition-all",children:[S.jsx(w_,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"Export"})]}),S.jsxs("div",{className:"absolute right-0 mt-1 w-44 bg-studio-900 border border-studio-700/60 rounded-xl shadow-2xl py-1 hidden group-hover:block z-50",children:[S.jsxs("button",{onClick:()=>t("gltf"),className:"w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between",children:[S.jsx("span",{children:"GLTF / GLB"}),S.jsx("span",{className:"text-[10px] text-slate-500 font-mono",children:"Web / Game"})]}),S.jsxs("button",{onClick:()=>t("obj"),className:"w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between",children:[S.jsx("span",{children:"Wavefront OBJ"}),S.jsx("span",{className:"text-[10px] text-slate-500 font-mono",children:"Blender"})]}),S.jsxs("button",{onClick:()=>t("stl"),className:"w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between",children:[S.jsx("span",{children:"STL"}),S.jsx("span",{className:"text-[10px] text-slate-500 font-mono",children:"3D Print"})]}),S.jsxs("button",{onClick:()=>t("scad"),className:"w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-studio-800 flex items-center justify-between",children:[S.jsx("span",{children:"OpenSCAD (.scad)"}),S.jsx("span",{className:"text-[10px] text-slate-500 font-mono",children:"CAD Code"})]})]})]}),S.jsxs("div",{className:"flex items-center gap-1 bg-studio-800/80 px-2 py-1 rounded-md text-[11px] text-slate-400 border border-studio-700/40",children:[S.jsx(R_,{className:"w-3.5 h-3.5 text-cyan-400"}),S.jsx(I_,{className:"w-3.5 h-3.5 text-blue-400"}),S.jsx("span",{className:"font-mono text-[10px]",children:"Win/Mac/Linux/Web"})]})]})]})};/**
 * @license
 * Copyright 2010-2024 Three.js Authors
 * SPDX-License-Identifier: MIT
 */const Df="170",$_=0,Mm=1,Y_=2,Ug=1,Fg=2,qi=3,Ur=0,Ln=1,Ni=2,Lr=0,oo=1,Em=2,wm=3,Tm=4,q_=5,as=100,Z_=101,K_=102,Q_=103,J_=104,ey=200,ty=201,ny=202,iy=203,Bd=204,Hd=205,ry=206,sy=207,oy=208,ay=209,ly=210,cy=211,uy=212,dy=213,fy=214,Vd=0,Gd=1,jd=2,co=3,Wd=4,Xd=5,$d=6,Yd=7,kg=0,hy=1,py=2,Dr=0,my=1,gy=2,xy=3,Og=4,vy=5,_y=6,yy=7,zg=300,uo=301,fo=302,qd=303,Zd=304,dc=306,Kd=1e3,cs=1001,Qd=1002,yi=1003,Sy=1004,Ml=1005,vi=1006,td=1007,us=1008,er=1009,Bg=1010,Hg=1011,da=1012,If=1013,ds=1014,Ki=1015,ha=1016,Uf=1017,Ff=1018,ho=1020,Vg=35902,Gg=1021,jg=1022,_i=1023,Wg=1024,Xg=1025,ao=1026,po=1027,$g=1028,kf=1029,Yg=1030,Of=1031,zf=1033,Kl=33776,Ql=33777,Jl=33778,ec=33779,Jd=35840,ef=35841,tf=35842,nf=35843,rf=36196,sf=37492,of=37496,af=37808,lf=37809,cf=37810,uf=37811,df=37812,ff=37813,hf=37814,pf=37815,mf=37816,gf=37817,xf=37818,vf=37819,_f=37820,yf=37821,tc=36492,Sf=36494,Mf=36495,qg=36283,Ef=36284,wf=36285,Tf=36286,My=3200,Ey=3201,Zg=0,wy=1,Pr="",ri="srgb",go="srgb-linear",fc="linear",Lt="srgb",zs=7680,bm=519,Ty=512,by=513,Ay=514,Kg=515,Cy=516,Ry=517,Py=518,Ny=519,bf=35044,Am="300 es",Qi=2e3,sc=2001;class hs{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});const r=this._listeners;r[e]===void 0&&(r[e]=[]),r[e].indexOf(t)===-1&&r[e].push(t)}hasEventListener(e,t){if(this._listeners===void 0)return!1;const r=this._listeners;return r[e]!==void 0&&r[e].indexOf(t)!==-1}removeEventListener(e,t){if(this._listeners===void 0)return;const a=this._listeners[e];if(a!==void 0){const l=a.indexOf(t);l!==-1&&a.splice(l,1)}}dispatchEvent(e){if(this._listeners===void 0)return;const r=this._listeners[e.type];if(r!==void 0){e.target=this;const a=r.slice(0);for(let l=0,u=a.length;l<u;l++)a[l].call(this,e);e.target=null}}}const Sn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],nd=Math.PI/180,Af=180/Math.PI;function Ir(){const s=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,r=Math.random()*4294967295|0;return(Sn[s&255]+Sn[s>>8&255]+Sn[s>>16&255]+Sn[s>>24&255]+"-"+Sn[e&255]+Sn[e>>8&255]+"-"+Sn[e>>16&15|64]+Sn[e>>24&255]+"-"+Sn[t&63|128]+Sn[t>>8&255]+"-"+Sn[t>>16&255]+Sn[t>>24&255]+Sn[r&255]+Sn[r>>8&255]+Sn[r>>16&255]+Sn[r>>24&255]).toLowerCase()}function Vn(s,e,t){return Math.max(e,Math.min(t,s))}function Ly(s,e){return(s%e+e)%e}function id(s,e,t){return(1-t)*s+t*e}function Li(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function Dt(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}class ut{constructor(e=0,t=0){ut.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){const t=this.x,r=this.y,a=e.elements;return this.x=a[0]*t+a[3]*r+a[6],this.y=a[1]*t+a[4]*r+a[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this}clampLength(e,t){const r=this.length();return this.divideScalar(r||1).multiplyScalar(Math.max(e,Math.min(t,r)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const r=this.dot(e)/t;return Math.acos(Vn(r,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,r=this.y-e.y;return t*t+r*r}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,r){return this.x=e.x+(t.x-e.x)*r,this.y=e.y+(t.y-e.y)*r,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){const r=Math.cos(t),a=Math.sin(t),l=this.x-e.x,u=this.y-e.y;return this.x=l*r-u*a+e.x,this.y=l*a+u*r+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}}class ft{constructor(e,t,r,a,l,u,d,h,m){ft.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,r,a,l,u,d,h,m)}set(e,t,r,a,l,u,d,h,m){const g=this.elements;return g[0]=e,g[1]=a,g[2]=d,g[3]=t,g[4]=l,g[5]=h,g[6]=r,g[7]=u,g[8]=m,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){const t=this.elements,r=e.elements;return t[0]=r[0],t[1]=r[1],t[2]=r[2],t[3]=r[3],t[4]=r[4],t[5]=r[5],t[6]=r[6],t[7]=r[7],t[8]=r[8],this}extractBasis(e,t,r){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),r.setFromMatrix3Column(this,2),this}setFromMatrix4(e){const t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const r=e.elements,a=t.elements,l=this.elements,u=r[0],d=r[3],h=r[6],m=r[1],g=r[4],_=r[7],v=r[2],M=r[5],T=r[8],b=a[0],y=a[3],x=a[6],L=a[1],N=a[4],w=a[7],O=a[2],D=a[5],F=a[8];return l[0]=u*b+d*L+h*O,l[3]=u*y+d*N+h*D,l[6]=u*x+d*w+h*F,l[1]=m*b+g*L+_*O,l[4]=m*y+g*N+_*D,l[7]=m*x+g*w+_*F,l[2]=v*b+M*L+T*O,l[5]=v*y+M*N+T*D,l[8]=v*x+M*w+T*F,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){const e=this.elements,t=e[0],r=e[1],a=e[2],l=e[3],u=e[4],d=e[5],h=e[6],m=e[7],g=e[8];return t*u*g-t*d*m-r*l*g+r*d*h+a*l*m-a*u*h}invert(){const e=this.elements,t=e[0],r=e[1],a=e[2],l=e[3],u=e[4],d=e[5],h=e[6],m=e[7],g=e[8],_=g*u-d*m,v=d*h-g*l,M=m*l-u*h,T=t*_+r*v+a*M;if(T===0)return this.set(0,0,0,0,0,0,0,0,0);const b=1/T;return e[0]=_*b,e[1]=(a*m-g*r)*b,e[2]=(d*r-a*u)*b,e[3]=v*b,e[4]=(g*t-a*h)*b,e[5]=(a*l-d*t)*b,e[6]=M*b,e[7]=(r*h-m*t)*b,e[8]=(u*t-r*l)*b,this}transpose(){let e;const t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){const t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,r,a,l,u,d){const h=Math.cos(l),m=Math.sin(l);return this.set(r*h,r*m,-r*(h*u+m*d)+u+e,-a*m,a*h,-a*(-m*u+h*d)+d+t,0,0,1),this}scale(e,t){return this.premultiply(rd.makeScale(e,t)),this}rotate(e){return this.premultiply(rd.makeRotation(-e)),this}translate(e,t){return this.premultiply(rd.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){const t=Math.cos(e),r=Math.sin(e);return this.set(t,-r,0,r,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){const t=this.elements,r=e.elements;for(let a=0;a<9;a++)if(t[a]!==r[a])return!1;return!0}fromArray(e,t=0){for(let r=0;r<9;r++)this.elements[r]=e[r+t];return this}toArray(e=[],t=0){const r=this.elements;return e[t]=r[0],e[t+1]=r[1],e[t+2]=r[2],e[t+3]=r[3],e[t+4]=r[4],e[t+5]=r[5],e[t+6]=r[6],e[t+7]=r[7],e[t+8]=r[8],e}clone(){return new this.constructor().fromArray(this.elements)}}const rd=new ft;function Qg(s){for(let e=s.length-1;e>=0;--e)if(s[e]>=65535)return!0;return!1}function oc(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Dy(){const s=oc("canvas");return s.style.display="block",s}const Cm={};function oa(s){s in Cm||(Cm[s]=!0,console.warn(s))}function Iy(s,e,t){return new Promise(function(r,a){function l(){switch(s.clientWaitSync(e,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:a();break;case s.TIMEOUT_EXPIRED:setTimeout(l,t);break;default:r()}}setTimeout(l,t)})}function Uy(s){const e=s.elements;e[2]=.5*e[2]+.5*e[3],e[6]=.5*e[6]+.5*e[7],e[10]=.5*e[10]+.5*e[11],e[14]=.5*e[14]+.5*e[15]}function Fy(s){const e=s.elements;e[11]===-1?(e[10]=-e[10]-1,e[14]=-e[14]):(e[10]=-e[10],e[14]=-e[14]+1)}const Tt={enabled:!0,workingColorSpace:go,spaces:{},convert:function(s,e,t){return this.enabled===!1||e===t||!e||!t||(this.spaces[e].transfer===Lt&&(s.r=Ji(s.r),s.g=Ji(s.g),s.b=Ji(s.b)),this.spaces[e].primaries!==this.spaces[t].primaries&&(s.applyMatrix3(this.spaces[e].toXYZ),s.applyMatrix3(this.spaces[t].fromXYZ)),this.spaces[t].transfer===Lt&&(s.r=lo(s.r),s.g=lo(s.g),s.b=lo(s.b))),s},fromWorkingColorSpace:function(s,e){return this.convert(s,this.workingColorSpace,e)},toWorkingColorSpace:function(s,e){return this.convert(s,e,this.workingColorSpace)},getPrimaries:function(s){return this.spaces[s].primaries},getTransfer:function(s){return s===Pr?fc:this.spaces[s].transfer},getLuminanceCoefficients:function(s,e=this.workingColorSpace){return s.fromArray(this.spaces[e].luminanceCoefficients)},define:function(s){Object.assign(this.spaces,s)},_getMatrix:function(s,e,t){return s.copy(this.spaces[e].toXYZ).multiply(this.spaces[t].fromXYZ)},_getDrawingBufferColorSpace:function(s){return this.spaces[s].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(s=this.workingColorSpace){return this.spaces[s].workingColorSpaceConfig.unpackColorSpace}};function Ji(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function lo(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}const Rm=[.64,.33,.3,.6,.15,.06],Pm=[.2126,.7152,.0722],Nm=[.3127,.329],Lm=new ft().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),Dm=new ft().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);Tt.define({[go]:{primaries:Rm,whitePoint:Nm,transfer:fc,toXYZ:Lm,fromXYZ:Dm,luminanceCoefficients:Pm,workingColorSpaceConfig:{unpackColorSpace:ri},outputColorSpaceConfig:{drawingBufferColorSpace:ri}},[ri]:{primaries:Rm,whitePoint:Nm,transfer:Lt,toXYZ:Lm,fromXYZ:Dm,luminanceCoefficients:Pm,outputColorSpaceConfig:{drawingBufferColorSpace:ri}}});let Bs;class ky{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{Bs===void 0&&(Bs=oc("canvas")),Bs.width=e.width,Bs.height=e.height;const r=Bs.getContext("2d");e instanceof ImageData?r.putImageData(e,0,0):r.drawImage(e,0,0,e.width,e.height),t=Bs}return t.width>2048||t.height>2048?(console.warn("THREE.ImageUtils.getDataURL: Image converted to jpg for performance reasons",e),t.toDataURL("image/jpeg",.6)):t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){const t=oc("canvas");t.width=e.width,t.height=e.height;const r=t.getContext("2d");r.drawImage(e,0,0,e.width,e.height);const a=r.getImageData(0,0,e.width,e.height),l=a.data;for(let u=0;u<l.length;u++)l[u]=Ji(l[u]/255)*255;return r.putImageData(a,0,0),t}else if(e.data){const t=e.data.slice(0);for(let r=0;r<t.length;r++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[r]=Math.floor(Ji(t[r]/255)*255):t[r]=Ji(t[r]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}}let Oy=0;class Jg{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:Oy++}),this.uuid=Ir(),this.data=e,this.dataReady=!0,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];const r={uuid:this.uuid,url:""},a=this.data;if(a!==null){let l;if(Array.isArray(a)){l=[];for(let u=0,d=a.length;u<d;u++)a[u].isDataTexture?l.push(sd(a[u].image)):l.push(sd(a[u]))}else l=sd(a);r.url=l}return t||(e.images[this.uuid]=r),r}}function sd(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?ky.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}let zy=0;class Dn extends hs{constructor(e=Dn.DEFAULT_IMAGE,t=Dn.DEFAULT_MAPPING,r=cs,a=cs,l=vi,u=us,d=_i,h=er,m=Dn.DEFAULT_ANISOTROPY,g=Pr){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:zy++}),this.uuid=Ir(),this.name="",this.source=new Jg(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=r,this.wrapT=a,this.magFilter=l,this.minFilter=u,this.anisotropy=m,this.format=d,this.internalFormat=null,this.type=h,this.offset=new ut(0,0),this.repeat=new ut(1,1),this.center=new ut(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new ft,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=g,this.userData={},this.version=0,this.onUpdate=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){const t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];const r={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(r.userData=this.userData),t||(e.textures[this.uuid]=r),r}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==zg)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case Kd:e.x=e.x-Math.floor(e.x);break;case cs:e.x=e.x<0?0:1;break;case Qd:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case Kd:e.y=e.y-Math.floor(e.y);break;case cs:e.y=e.y<0?0:1;break;case Qd:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}}Dn.DEFAULT_IMAGE=null;Dn.DEFAULT_MAPPING=zg;Dn.DEFAULT_ANISOTROPY=1;class qt{constructor(e=0,t=0,r=0,a=1){qt.prototype.isVector4=!0,this.x=e,this.y=t,this.z=r,this.w=a}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,r,a){return this.x=e,this.y=t,this.z=r,this.w=a,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){const t=this.x,r=this.y,a=this.z,l=this.w,u=e.elements;return this.x=u[0]*t+u[4]*r+u[8]*a+u[12]*l,this.y=u[1]*t+u[5]*r+u[9]*a+u[13]*l,this.z=u[2]*t+u[6]*r+u[10]*a+u[14]*l,this.w=u[3]*t+u[7]*r+u[11]*a+u[15]*l,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);const t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,r,a,l;const h=e.elements,m=h[0],g=h[4],_=h[8],v=h[1],M=h[5],T=h[9],b=h[2],y=h[6],x=h[10];if(Math.abs(g-v)<.01&&Math.abs(_-b)<.01&&Math.abs(T-y)<.01){if(Math.abs(g+v)<.1&&Math.abs(_+b)<.1&&Math.abs(T+y)<.1&&Math.abs(m+M+x-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;const N=(m+1)/2,w=(M+1)/2,O=(x+1)/2,D=(g+v)/4,F=(_+b)/4,B=(T+y)/4;return N>w&&N>O?N<.01?(r=0,a=.707106781,l=.707106781):(r=Math.sqrt(N),a=D/r,l=F/r):w>O?w<.01?(r=.707106781,a=0,l=.707106781):(a=Math.sqrt(w),r=D/a,l=B/a):O<.01?(r=.707106781,a=.707106781,l=0):(l=Math.sqrt(O),r=F/l,a=B/l),this.set(r,a,l,t),this}let L=Math.sqrt((y-T)*(y-T)+(_-b)*(_-b)+(v-g)*(v-g));return Math.abs(L)<.001&&(L=1),this.x=(y-T)/L,this.y=(_-b)/L,this.z=(v-g)/L,this.w=Math.acos((m+M+x-1)/2),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this.w=Math.max(e.w,Math.min(t.w,this.w)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this.w=Math.max(e,Math.min(t,this.w)),this}clampLength(e,t){const r=this.length();return this.divideScalar(r||1).multiplyScalar(Math.max(e,Math.min(t,r)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,r){return this.x=e.x+(t.x-e.x)*r,this.y=e.y+(t.y-e.y)*r,this.z=e.z+(t.z-e.z)*r,this.w=e.w+(t.w-e.w)*r,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}}class By extends hs{constructor(e=1,t=1,r={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new qt(0,0,e,t),this.scissorTest=!1,this.viewport=new qt(0,0,e,t);const a={width:e,height:t,depth:1};r=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:vi,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},r);const l=new Dn(a,r.mapping,r.wrapS,r.wrapT,r.magFilter,r.minFilter,r.format,r.type,r.anisotropy,r.colorSpace);l.flipY=!1,l.generateMipmaps=r.generateMipmaps,l.internalFormat=r.internalFormat,this.textures=[];const u=r.count;for(let d=0;d<u;d++)this.textures[d]=l.clone(),this.textures[d].isRenderTargetTexture=!0;this.depthBuffer=r.depthBuffer,this.stencilBuffer=r.stencilBuffer,this.resolveDepthBuffer=r.resolveDepthBuffer,this.resolveStencilBuffer=r.resolveStencilBuffer,this.depthTexture=r.depthTexture,this.samples=r.samples}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}setSize(e,t,r=1){if(this.width!==e||this.height!==t||this.depth!==r){this.width=e,this.height=t,this.depth=r;for(let a=0,l=this.textures.length;a<l;a++)this.textures[a].image.width=e,this.textures[a].image.height=t,this.textures[a].image.depth=r;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let r=0,a=e.textures.length;r<a;r++)this.textures[r]=e.textures[r].clone(),this.textures[r].isRenderTargetTexture=!0;const t=Object.assign({},e.texture.image);return this.texture.source=new Jg(t),this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}}class fs extends By{constructor(e=1,t=1,r={}){super(e,t,r),this.isWebGLRenderTarget=!0}}class ex extends Dn{constructor(e=null,t=1,r=1,a=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:r,depth:a},this.magFilter=yi,this.minFilter=yi,this.wrapR=cs,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}}class Hy extends Dn{constructor(e=null,t=1,r=1,a=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:r,depth:a},this.magFilter=yi,this.minFilter=yi,this.wrapR=cs,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}}class Nn{constructor(e=0,t=0,r=0,a=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=r,this._w=a}static slerpFlat(e,t,r,a,l,u,d){let h=r[a+0],m=r[a+1],g=r[a+2],_=r[a+3];const v=l[u+0],M=l[u+1],T=l[u+2],b=l[u+3];if(d===0){e[t+0]=h,e[t+1]=m,e[t+2]=g,e[t+3]=_;return}if(d===1){e[t+0]=v,e[t+1]=M,e[t+2]=T,e[t+3]=b;return}if(_!==b||h!==v||m!==M||g!==T){let y=1-d;const x=h*v+m*M+g*T+_*b,L=x>=0?1:-1,N=1-x*x;if(N>Number.EPSILON){const O=Math.sqrt(N),D=Math.atan2(O,x*L);y=Math.sin(y*D)/O,d=Math.sin(d*D)/O}const w=d*L;if(h=h*y+v*w,m=m*y+M*w,g=g*y+T*w,_=_*y+b*w,y===1-d){const O=1/Math.sqrt(h*h+m*m+g*g+_*_);h*=O,m*=O,g*=O,_*=O}}e[t]=h,e[t+1]=m,e[t+2]=g,e[t+3]=_}static multiplyQuaternionsFlat(e,t,r,a,l,u){const d=r[a],h=r[a+1],m=r[a+2],g=r[a+3],_=l[u],v=l[u+1],M=l[u+2],T=l[u+3];return e[t]=d*T+g*_+h*M-m*v,e[t+1]=h*T+g*v+m*_-d*M,e[t+2]=m*T+g*M+d*v-h*_,e[t+3]=g*T-d*_-h*v-m*M,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,r,a){return this._x=e,this._y=t,this._z=r,this._w=a,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){const r=e._x,a=e._y,l=e._z,u=e._order,d=Math.cos,h=Math.sin,m=d(r/2),g=d(a/2),_=d(l/2),v=h(r/2),M=h(a/2),T=h(l/2);switch(u){case"XYZ":this._x=v*g*_+m*M*T,this._y=m*M*_-v*g*T,this._z=m*g*T+v*M*_,this._w=m*g*_-v*M*T;break;case"YXZ":this._x=v*g*_+m*M*T,this._y=m*M*_-v*g*T,this._z=m*g*T-v*M*_,this._w=m*g*_+v*M*T;break;case"ZXY":this._x=v*g*_-m*M*T,this._y=m*M*_+v*g*T,this._z=m*g*T+v*M*_,this._w=m*g*_-v*M*T;break;case"ZYX":this._x=v*g*_-m*M*T,this._y=m*M*_+v*g*T,this._z=m*g*T-v*M*_,this._w=m*g*_+v*M*T;break;case"YZX":this._x=v*g*_+m*M*T,this._y=m*M*_+v*g*T,this._z=m*g*T-v*M*_,this._w=m*g*_-v*M*T;break;case"XZY":this._x=v*g*_-m*M*T,this._y=m*M*_-v*g*T,this._z=m*g*T+v*M*_,this._w=m*g*_+v*M*T;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+u)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){const r=t/2,a=Math.sin(r);return this._x=e.x*a,this._y=e.y*a,this._z=e.z*a,this._w=Math.cos(r),this._onChangeCallback(),this}setFromRotationMatrix(e){const t=e.elements,r=t[0],a=t[4],l=t[8],u=t[1],d=t[5],h=t[9],m=t[2],g=t[6],_=t[10],v=r+d+_;if(v>0){const M=.5/Math.sqrt(v+1);this._w=.25/M,this._x=(g-h)*M,this._y=(l-m)*M,this._z=(u-a)*M}else if(r>d&&r>_){const M=2*Math.sqrt(1+r-d-_);this._w=(g-h)/M,this._x=.25*M,this._y=(a+u)/M,this._z=(l+m)/M}else if(d>_){const M=2*Math.sqrt(1+d-r-_);this._w=(l-m)/M,this._x=(a+u)/M,this._y=.25*M,this._z=(h+g)/M}else{const M=2*Math.sqrt(1+_-r-d);this._w=(u-a)/M,this._x=(l+m)/M,this._y=(h+g)/M,this._z=.25*M}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let r=e.dot(t)+1;return r<Number.EPSILON?(r=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=r):(this._x=0,this._y=-e.z,this._z=e.y,this._w=r)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=r),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(Vn(this.dot(e),-1,1)))}rotateTowards(e,t){const r=this.angleTo(e);if(r===0)return this;const a=Math.min(1,t/r);return this.slerp(e,a),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){const r=e._x,a=e._y,l=e._z,u=e._w,d=t._x,h=t._y,m=t._z,g=t._w;return this._x=r*g+u*d+a*m-l*h,this._y=a*g+u*h+l*d-r*m,this._z=l*g+u*m+r*h-a*d,this._w=u*g-r*d-a*h-l*m,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);const r=this._x,a=this._y,l=this._z,u=this._w;let d=u*e._w+r*e._x+a*e._y+l*e._z;if(d<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,d=-d):this.copy(e),d>=1)return this._w=u,this._x=r,this._y=a,this._z=l,this;const h=1-d*d;if(h<=Number.EPSILON){const M=1-t;return this._w=M*u+t*this._w,this._x=M*r+t*this._x,this._y=M*a+t*this._y,this._z=M*l+t*this._z,this.normalize(),this}const m=Math.sqrt(h),g=Math.atan2(m,d),_=Math.sin((1-t)*g)/m,v=Math.sin(t*g)/m;return this._w=u*_+this._w*v,this._x=r*_+this._x*v,this._y=a*_+this._y*v,this._z=l*_+this._z*v,this._onChangeCallback(),this}slerpQuaternions(e,t,r){return this.copy(e).slerp(t,r)}random(){const e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),r=Math.random(),a=Math.sqrt(1-r),l=Math.sqrt(r);return this.set(a*Math.sin(e),a*Math.cos(e),l*Math.sin(t),l*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}}class V{constructor(e=0,t=0,r=0){V.prototype.isVector3=!0,this.x=e,this.y=t,this.z=r}set(e,t,r){return r===void 0&&(r=this.z),this.x=e,this.y=t,this.z=r,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(Im.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(Im.setFromAxisAngle(e,t))}applyMatrix3(e){const t=this.x,r=this.y,a=this.z,l=e.elements;return this.x=l[0]*t+l[3]*r+l[6]*a,this.y=l[1]*t+l[4]*r+l[7]*a,this.z=l[2]*t+l[5]*r+l[8]*a,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){const t=this.x,r=this.y,a=this.z,l=e.elements,u=1/(l[3]*t+l[7]*r+l[11]*a+l[15]);return this.x=(l[0]*t+l[4]*r+l[8]*a+l[12])*u,this.y=(l[1]*t+l[5]*r+l[9]*a+l[13])*u,this.z=(l[2]*t+l[6]*r+l[10]*a+l[14])*u,this}applyQuaternion(e){const t=this.x,r=this.y,a=this.z,l=e.x,u=e.y,d=e.z,h=e.w,m=2*(u*a-d*r),g=2*(d*t-l*a),_=2*(l*r-u*t);return this.x=t+h*m+u*_-d*g,this.y=r+h*g+d*m-l*_,this.z=a+h*_+l*g-u*m,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){const t=this.x,r=this.y,a=this.z,l=e.elements;return this.x=l[0]*t+l[4]*r+l[8]*a,this.y=l[1]*t+l[5]*r+l[9]*a,this.z=l[2]*t+l[6]*r+l[10]*a,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=Math.max(e.x,Math.min(t.x,this.x)),this.y=Math.max(e.y,Math.min(t.y,this.y)),this.z=Math.max(e.z,Math.min(t.z,this.z)),this}clampScalar(e,t){return this.x=Math.max(e,Math.min(t,this.x)),this.y=Math.max(e,Math.min(t,this.y)),this.z=Math.max(e,Math.min(t,this.z)),this}clampLength(e,t){const r=this.length();return this.divideScalar(r||1).multiplyScalar(Math.max(e,Math.min(t,r)))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,r){return this.x=e.x+(t.x-e.x)*r,this.y=e.y+(t.y-e.y)*r,this.z=e.z+(t.z-e.z)*r,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){const r=e.x,a=e.y,l=e.z,u=t.x,d=t.y,h=t.z;return this.x=a*h-l*d,this.y=l*u-r*h,this.z=r*d-a*u,this}projectOnVector(e){const t=e.lengthSq();if(t===0)return this.set(0,0,0);const r=e.dot(this)/t;return this.copy(e).multiplyScalar(r)}projectOnPlane(e){return od.copy(this).projectOnVector(e),this.sub(od)}reflect(e){return this.sub(od.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){const t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;const r=this.dot(e)/t;return Math.acos(Vn(r,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){const t=this.x-e.x,r=this.y-e.y,a=this.z-e.z;return t*t+r*r+a*a}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,r){const a=Math.sin(t)*e;return this.x=a*Math.sin(r),this.y=Math.cos(t)*e,this.z=a*Math.cos(r),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,r){return this.x=e*Math.sin(t),this.y=r,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){const t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){const t=this.setFromMatrixColumn(e,0).length(),r=this.setFromMatrixColumn(e,1).length(),a=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=r,this.z=a,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){const e=Math.random()*Math.PI*2,t=Math.random()*2-1,r=Math.sqrt(1-t*t);return this.x=r*Math.cos(e),this.y=t,this.z=r*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}}const od=new V,Im=new Nn;class pa{constructor(e=new V(1/0,1/0,1/0),t=new V(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,r=e.length;t<r;t+=3)this.expandByPoint(mi.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,r=e.count;t<r;t++)this.expandByPoint(mi.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,r=e.length;t<r;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){const r=mi.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(r),this.max.copy(e).add(r),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);const r=e.geometry;if(r!==void 0){const l=r.getAttribute("position");if(t===!0&&l!==void 0&&e.isInstancedMesh!==!0)for(let u=0,d=l.count;u<d;u++)e.isMesh===!0?e.getVertexPosition(u,mi):mi.fromBufferAttribute(l,u),mi.applyMatrix4(e.matrixWorld),this.expandByPoint(mi);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),El.copy(e.boundingBox)):(r.boundingBox===null&&r.computeBoundingBox(),El.copy(r.boundingBox)),El.applyMatrix4(e.matrixWorld),this.union(El)}const a=e.children;for(let l=0,u=a.length;l<u;l++)this.expandByObject(a[l],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,mi),mi.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,r;return e.normal.x>0?(t=e.normal.x*this.min.x,r=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,r=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,r+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,r+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,r+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,r+=e.normal.z*this.min.z),t<=-e.constant&&r>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Zo),wl.subVectors(this.max,Zo),Hs.subVectors(e.a,Zo),Vs.subVectors(e.b,Zo),Gs.subVectors(e.c,Zo),Er.subVectors(Vs,Hs),wr.subVectors(Gs,Vs),Kr.subVectors(Hs,Gs);let t=[0,-Er.z,Er.y,0,-wr.z,wr.y,0,-Kr.z,Kr.y,Er.z,0,-Er.x,wr.z,0,-wr.x,Kr.z,0,-Kr.x,-Er.y,Er.x,0,-wr.y,wr.x,0,-Kr.y,Kr.x,0];return!ad(t,Hs,Vs,Gs,wl)||(t=[1,0,0,0,1,0,0,0,1],!ad(t,Hs,Vs,Gs,wl))?!1:(Tl.crossVectors(Er,wr),t=[Tl.x,Tl.y,Tl.z],ad(t,Hs,Vs,Gs,wl))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,mi).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(mi).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(ji[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),ji[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),ji[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),ji[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),ji[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),ji[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),ji[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),ji[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(ji),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}}const ji=[new V,new V,new V,new V,new V,new V,new V,new V],mi=new V,El=new pa,Hs=new V,Vs=new V,Gs=new V,Er=new V,wr=new V,Kr=new V,Zo=new V,wl=new V,Tl=new V,Qr=new V;function ad(s,e,t,r,a){for(let l=0,u=s.length-3;l<=u;l+=3){Qr.fromArray(s,l);const d=a.x*Math.abs(Qr.x)+a.y*Math.abs(Qr.y)+a.z*Math.abs(Qr.z),h=e.dot(Qr),m=t.dot(Qr),g=r.dot(Qr);if(Math.max(-Math.max(h,m,g),Math.min(h,m,g))>d)return!1}return!0}const Vy=new pa,Ko=new V,ld=new V;class hc{constructor(e=new V,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){const r=this.center;t!==void 0?r.copy(t):Vy.setFromPoints(e).getCenter(r);let a=0;for(let l=0,u=e.length;l<u;l++)a=Math.max(a,r.distanceToSquared(e[l]));return this.radius=Math.sqrt(a),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){const t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){const r=this.center.distanceToSquared(e);return t.copy(e),r>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Ko.subVectors(e,this.center);const t=Ko.lengthSq();if(t>this.radius*this.radius){const r=Math.sqrt(t),a=(r-this.radius)*.5;this.center.addScaledVector(Ko,a/r),this.radius+=a}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(ld.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Ko.copy(e.center).add(ld)),this.expandByPoint(Ko.copy(e.center).sub(ld))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}}const Wi=new V,cd=new V,bl=new V,Tr=new V,ud=new V,Al=new V,dd=new V;class Bf{constructor(e=new V,t=new V(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,Wi)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);const r=t.dot(this.direction);return r<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,r)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){const t=Wi.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(Wi.copy(this.origin).addScaledVector(this.direction,t),Wi.distanceToSquared(e))}distanceSqToSegment(e,t,r,a){cd.copy(e).add(t).multiplyScalar(.5),bl.copy(t).sub(e).normalize(),Tr.copy(this.origin).sub(cd);const l=e.distanceTo(t)*.5,u=-this.direction.dot(bl),d=Tr.dot(this.direction),h=-Tr.dot(bl),m=Tr.lengthSq(),g=Math.abs(1-u*u);let _,v,M,T;if(g>0)if(_=u*h-d,v=u*d-h,T=l*g,_>=0)if(v>=-T)if(v<=T){const b=1/g;_*=b,v*=b,M=_*(_+u*v+2*d)+v*(u*_+v+2*h)+m}else v=l,_=Math.max(0,-(u*v+d)),M=-_*_+v*(v+2*h)+m;else v=-l,_=Math.max(0,-(u*v+d)),M=-_*_+v*(v+2*h)+m;else v<=-T?(_=Math.max(0,-(-u*l+d)),v=_>0?-l:Math.min(Math.max(-l,-h),l),M=-_*_+v*(v+2*h)+m):v<=T?(_=0,v=Math.min(Math.max(-l,-h),l),M=v*(v+2*h)+m):(_=Math.max(0,-(u*l+d)),v=_>0?l:Math.min(Math.max(-l,-h),l),M=-_*_+v*(v+2*h)+m);else v=u>0?-l:l,_=Math.max(0,-(u*v+d)),M=-_*_+v*(v+2*h)+m;return r&&r.copy(this.origin).addScaledVector(this.direction,_),a&&a.copy(cd).addScaledVector(bl,v),M}intersectSphere(e,t){Wi.subVectors(e.center,this.origin);const r=Wi.dot(this.direction),a=Wi.dot(Wi)-r*r,l=e.radius*e.radius;if(a>l)return null;const u=Math.sqrt(l-a),d=r-u,h=r+u;return h<0?null:d<0?this.at(h,t):this.at(d,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){const t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;const r=-(this.origin.dot(e.normal)+e.constant)/t;return r>=0?r:null}intersectPlane(e,t){const r=this.distanceToPlane(e);return r===null?null:this.at(r,t)}intersectsPlane(e){const t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let r,a,l,u,d,h;const m=1/this.direction.x,g=1/this.direction.y,_=1/this.direction.z,v=this.origin;return m>=0?(r=(e.min.x-v.x)*m,a=(e.max.x-v.x)*m):(r=(e.max.x-v.x)*m,a=(e.min.x-v.x)*m),g>=0?(l=(e.min.y-v.y)*g,u=(e.max.y-v.y)*g):(l=(e.max.y-v.y)*g,u=(e.min.y-v.y)*g),r>u||l>a||((l>r||isNaN(r))&&(r=l),(u<a||isNaN(a))&&(a=u),_>=0?(d=(e.min.z-v.z)*_,h=(e.max.z-v.z)*_):(d=(e.max.z-v.z)*_,h=(e.min.z-v.z)*_),r>h||d>a)||((d>r||r!==r)&&(r=d),(h<a||a!==a)&&(a=h),a<0)?null:this.at(r>=0?r:a,t)}intersectsBox(e){return this.intersectBox(e,Wi)!==null}intersectTriangle(e,t,r,a,l){ud.subVectors(t,e),Al.subVectors(r,e),dd.crossVectors(ud,Al);let u=this.direction.dot(dd),d;if(u>0){if(a)return null;d=1}else if(u<0)d=-1,u=-u;else return null;Tr.subVectors(this.origin,e);const h=d*this.direction.dot(Al.crossVectors(Tr,Al));if(h<0)return null;const m=d*this.direction.dot(ud.cross(Tr));if(m<0||h+m>u)return null;const g=-d*Tr.dot(dd);return g<0?null:this.at(g/u,l)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}}class Ft{constructor(e,t,r,a,l,u,d,h,m,g,_,v,M,T,b,y){Ft.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,r,a,l,u,d,h,m,g,_,v,M,T,b,y)}set(e,t,r,a,l,u,d,h,m,g,_,v,M,T,b,y){const x=this.elements;return x[0]=e,x[4]=t,x[8]=r,x[12]=a,x[1]=l,x[5]=u,x[9]=d,x[13]=h,x[2]=m,x[6]=g,x[10]=_,x[14]=v,x[3]=M,x[7]=T,x[11]=b,x[15]=y,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new Ft().fromArray(this.elements)}copy(e){const t=this.elements,r=e.elements;return t[0]=r[0],t[1]=r[1],t[2]=r[2],t[3]=r[3],t[4]=r[4],t[5]=r[5],t[6]=r[6],t[7]=r[7],t[8]=r[8],t[9]=r[9],t[10]=r[10],t[11]=r[11],t[12]=r[12],t[13]=r[13],t[14]=r[14],t[15]=r[15],this}copyPosition(e){const t=this.elements,r=e.elements;return t[12]=r[12],t[13]=r[13],t[14]=r[14],this}setFromMatrix3(e){const t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,r){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),r.setFromMatrixColumn(this,2),this}makeBasis(e,t,r){return this.set(e.x,t.x,r.x,0,e.y,t.y,r.y,0,e.z,t.z,r.z,0,0,0,0,1),this}extractRotation(e){const t=this.elements,r=e.elements,a=1/js.setFromMatrixColumn(e,0).length(),l=1/js.setFromMatrixColumn(e,1).length(),u=1/js.setFromMatrixColumn(e,2).length();return t[0]=r[0]*a,t[1]=r[1]*a,t[2]=r[2]*a,t[3]=0,t[4]=r[4]*l,t[5]=r[5]*l,t[6]=r[6]*l,t[7]=0,t[8]=r[8]*u,t[9]=r[9]*u,t[10]=r[10]*u,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){const t=this.elements,r=e.x,a=e.y,l=e.z,u=Math.cos(r),d=Math.sin(r),h=Math.cos(a),m=Math.sin(a),g=Math.cos(l),_=Math.sin(l);if(e.order==="XYZ"){const v=u*g,M=u*_,T=d*g,b=d*_;t[0]=h*g,t[4]=-h*_,t[8]=m,t[1]=M+T*m,t[5]=v-b*m,t[9]=-d*h,t[2]=b-v*m,t[6]=T+M*m,t[10]=u*h}else if(e.order==="YXZ"){const v=h*g,M=h*_,T=m*g,b=m*_;t[0]=v+b*d,t[4]=T*d-M,t[8]=u*m,t[1]=u*_,t[5]=u*g,t[9]=-d,t[2]=M*d-T,t[6]=b+v*d,t[10]=u*h}else if(e.order==="ZXY"){const v=h*g,M=h*_,T=m*g,b=m*_;t[0]=v-b*d,t[4]=-u*_,t[8]=T+M*d,t[1]=M+T*d,t[5]=u*g,t[9]=b-v*d,t[2]=-u*m,t[6]=d,t[10]=u*h}else if(e.order==="ZYX"){const v=u*g,M=u*_,T=d*g,b=d*_;t[0]=h*g,t[4]=T*m-M,t[8]=v*m+b,t[1]=h*_,t[5]=b*m+v,t[9]=M*m-T,t[2]=-m,t[6]=d*h,t[10]=u*h}else if(e.order==="YZX"){const v=u*h,M=u*m,T=d*h,b=d*m;t[0]=h*g,t[4]=b-v*_,t[8]=T*_+M,t[1]=_,t[5]=u*g,t[9]=-d*g,t[2]=-m*g,t[6]=M*_+T,t[10]=v-b*_}else if(e.order==="XZY"){const v=u*h,M=u*m,T=d*h,b=d*m;t[0]=h*g,t[4]=-_,t[8]=m*g,t[1]=v*_+b,t[5]=u*g,t[9]=M*_-T,t[2]=T*_-M,t[6]=d*g,t[10]=b*_+v}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Gy,e,jy)}lookAt(e,t,r){const a=this.elements;return $n.subVectors(e,t),$n.lengthSq()===0&&($n.z=1),$n.normalize(),br.crossVectors(r,$n),br.lengthSq()===0&&(Math.abs(r.z)===1?$n.x+=1e-4:$n.z+=1e-4,$n.normalize(),br.crossVectors(r,$n)),br.normalize(),Cl.crossVectors($n,br),a[0]=br.x,a[4]=Cl.x,a[8]=$n.x,a[1]=br.y,a[5]=Cl.y,a[9]=$n.y,a[2]=br.z,a[6]=Cl.z,a[10]=$n.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){const r=e.elements,a=t.elements,l=this.elements,u=r[0],d=r[4],h=r[8],m=r[12],g=r[1],_=r[5],v=r[9],M=r[13],T=r[2],b=r[6],y=r[10],x=r[14],L=r[3],N=r[7],w=r[11],O=r[15],D=a[0],F=a[4],B=a[8],P=a[12],A=a[1],H=a[5],te=a[9],J=a[13],oe=a[2],ce=a[6],j=a[10],Q=a[14],z=a[3],X=a[7],q=a[11],I=a[15];return l[0]=u*D+d*A+h*oe+m*z,l[4]=u*F+d*H+h*ce+m*X,l[8]=u*B+d*te+h*j+m*q,l[12]=u*P+d*J+h*Q+m*I,l[1]=g*D+_*A+v*oe+M*z,l[5]=g*F+_*H+v*ce+M*X,l[9]=g*B+_*te+v*j+M*q,l[13]=g*P+_*J+v*Q+M*I,l[2]=T*D+b*A+y*oe+x*z,l[6]=T*F+b*H+y*ce+x*X,l[10]=T*B+b*te+y*j+x*q,l[14]=T*P+b*J+y*Q+x*I,l[3]=L*D+N*A+w*oe+O*z,l[7]=L*F+N*H+w*ce+O*X,l[11]=L*B+N*te+w*j+O*q,l[15]=L*P+N*J+w*Q+O*I,this}multiplyScalar(e){const t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){const e=this.elements,t=e[0],r=e[4],a=e[8],l=e[12],u=e[1],d=e[5],h=e[9],m=e[13],g=e[2],_=e[6],v=e[10],M=e[14],T=e[3],b=e[7],y=e[11],x=e[15];return T*(+l*h*_-a*m*_-l*d*v+r*m*v+a*d*M-r*h*M)+b*(+t*h*M-t*m*v+l*u*v-a*u*M+a*m*g-l*h*g)+y*(+t*m*_-t*d*M-l*u*_+r*u*M+l*d*g-r*m*g)+x*(-a*d*g-t*h*_+t*d*v+a*u*_-r*u*v+r*h*g)}transpose(){const e=this.elements;let t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,r){const a=this.elements;return e.isVector3?(a[12]=e.x,a[13]=e.y,a[14]=e.z):(a[12]=e,a[13]=t,a[14]=r),this}invert(){const e=this.elements,t=e[0],r=e[1],a=e[2],l=e[3],u=e[4],d=e[5],h=e[6],m=e[7],g=e[8],_=e[9],v=e[10],M=e[11],T=e[12],b=e[13],y=e[14],x=e[15],L=_*y*m-b*v*m+b*h*M-d*y*M-_*h*x+d*v*x,N=T*v*m-g*y*m-T*h*M+u*y*M+g*h*x-u*v*x,w=g*b*m-T*_*m+T*d*M-u*b*M-g*d*x+u*_*x,O=T*_*h-g*b*h-T*d*v+u*b*v+g*d*y-u*_*y,D=t*L+r*N+a*w+l*O;if(D===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);const F=1/D;return e[0]=L*F,e[1]=(b*v*l-_*y*l-b*a*M+r*y*M+_*a*x-r*v*x)*F,e[2]=(d*y*l-b*h*l+b*a*m-r*y*m-d*a*x+r*h*x)*F,e[3]=(_*h*l-d*v*l-_*a*m+r*v*m+d*a*M-r*h*M)*F,e[4]=N*F,e[5]=(g*y*l-T*v*l+T*a*M-t*y*M-g*a*x+t*v*x)*F,e[6]=(T*h*l-u*y*l-T*a*m+t*y*m+u*a*x-t*h*x)*F,e[7]=(u*v*l-g*h*l+g*a*m-t*v*m-u*a*M+t*h*M)*F,e[8]=w*F,e[9]=(T*_*l-g*b*l-T*r*M+t*b*M+g*r*x-t*_*x)*F,e[10]=(u*b*l-T*d*l+T*r*m-t*b*m-u*r*x+t*d*x)*F,e[11]=(g*d*l-u*_*l-g*r*m+t*_*m+u*r*M-t*d*M)*F,e[12]=O*F,e[13]=(g*b*a-T*_*a+T*r*v-t*b*v-g*r*y+t*_*y)*F,e[14]=(T*d*a-u*b*a-T*r*h+t*b*h+u*r*y-t*d*y)*F,e[15]=(u*_*a-g*d*a+g*r*h-t*_*h-u*r*v+t*d*v)*F,this}scale(e){const t=this.elements,r=e.x,a=e.y,l=e.z;return t[0]*=r,t[4]*=a,t[8]*=l,t[1]*=r,t[5]*=a,t[9]*=l,t[2]*=r,t[6]*=a,t[10]*=l,t[3]*=r,t[7]*=a,t[11]*=l,this}getMaxScaleOnAxis(){const e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],r=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],a=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,r,a))}makeTranslation(e,t,r){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,r,0,0,0,1),this}makeRotationX(e){const t=Math.cos(e),r=Math.sin(e);return this.set(1,0,0,0,0,t,-r,0,0,r,t,0,0,0,0,1),this}makeRotationY(e){const t=Math.cos(e),r=Math.sin(e);return this.set(t,0,r,0,0,1,0,0,-r,0,t,0,0,0,0,1),this}makeRotationZ(e){const t=Math.cos(e),r=Math.sin(e);return this.set(t,-r,0,0,r,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){const r=Math.cos(t),a=Math.sin(t),l=1-r,u=e.x,d=e.y,h=e.z,m=l*u,g=l*d;return this.set(m*u+r,m*d-a*h,m*h+a*d,0,m*d+a*h,g*d+r,g*h-a*u,0,m*h-a*d,g*h+a*u,l*h*h+r,0,0,0,0,1),this}makeScale(e,t,r){return this.set(e,0,0,0,0,t,0,0,0,0,r,0,0,0,0,1),this}makeShear(e,t,r,a,l,u){return this.set(1,r,l,0,e,1,u,0,t,a,1,0,0,0,0,1),this}compose(e,t,r){const a=this.elements,l=t._x,u=t._y,d=t._z,h=t._w,m=l+l,g=u+u,_=d+d,v=l*m,M=l*g,T=l*_,b=u*g,y=u*_,x=d*_,L=h*m,N=h*g,w=h*_,O=r.x,D=r.y,F=r.z;return a[0]=(1-(b+x))*O,a[1]=(M+w)*O,a[2]=(T-N)*O,a[3]=0,a[4]=(M-w)*D,a[5]=(1-(v+x))*D,a[6]=(y+L)*D,a[7]=0,a[8]=(T+N)*F,a[9]=(y-L)*F,a[10]=(1-(v+b))*F,a[11]=0,a[12]=e.x,a[13]=e.y,a[14]=e.z,a[15]=1,this}decompose(e,t,r){const a=this.elements;let l=js.set(a[0],a[1],a[2]).length();const u=js.set(a[4],a[5],a[6]).length(),d=js.set(a[8],a[9],a[10]).length();this.determinant()<0&&(l=-l),e.x=a[12],e.y=a[13],e.z=a[14],gi.copy(this);const m=1/l,g=1/u,_=1/d;return gi.elements[0]*=m,gi.elements[1]*=m,gi.elements[2]*=m,gi.elements[4]*=g,gi.elements[5]*=g,gi.elements[6]*=g,gi.elements[8]*=_,gi.elements[9]*=_,gi.elements[10]*=_,t.setFromRotationMatrix(gi),r.x=l,r.y=u,r.z=d,this}makePerspective(e,t,r,a,l,u,d=Qi){const h=this.elements,m=2*l/(t-e),g=2*l/(r-a),_=(t+e)/(t-e),v=(r+a)/(r-a);let M,T;if(d===Qi)M=-(u+l)/(u-l),T=-2*u*l/(u-l);else if(d===sc)M=-u/(u-l),T=-u*l/(u-l);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+d);return h[0]=m,h[4]=0,h[8]=_,h[12]=0,h[1]=0,h[5]=g,h[9]=v,h[13]=0,h[2]=0,h[6]=0,h[10]=M,h[14]=T,h[3]=0,h[7]=0,h[11]=-1,h[15]=0,this}makeOrthographic(e,t,r,a,l,u,d=Qi){const h=this.elements,m=1/(t-e),g=1/(r-a),_=1/(u-l),v=(t+e)*m,M=(r+a)*g;let T,b;if(d===Qi)T=(u+l)*_,b=-2*_;else if(d===sc)T=l*_,b=-1*_;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+d);return h[0]=2*m,h[4]=0,h[8]=0,h[12]=-v,h[1]=0,h[5]=2*g,h[9]=0,h[13]=-M,h[2]=0,h[6]=0,h[10]=b,h[14]=-T,h[3]=0,h[7]=0,h[11]=0,h[15]=1,this}equals(e){const t=this.elements,r=e.elements;for(let a=0;a<16;a++)if(t[a]!==r[a])return!1;return!0}fromArray(e,t=0){for(let r=0;r<16;r++)this.elements[r]=e[r+t];return this}toArray(e=[],t=0){const r=this.elements;return e[t]=r[0],e[t+1]=r[1],e[t+2]=r[2],e[t+3]=r[3],e[t+4]=r[4],e[t+5]=r[5],e[t+6]=r[6],e[t+7]=r[7],e[t+8]=r[8],e[t+9]=r[9],e[t+10]=r[10],e[t+11]=r[11],e[t+12]=r[12],e[t+13]=r[13],e[t+14]=r[14],e[t+15]=r[15],e}}const js=new V,gi=new Ft,Gy=new V(0,0,0),jy=new V(1,1,1),br=new V,Cl=new V,$n=new V,Um=new Ft,Fm=new Nn;class Mi{constructor(e=0,t=0,r=0,a=Mi.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=r,this._order=a}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,r,a=this._order){return this._x=e,this._y=t,this._z=r,this._order=a,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,r=!0){const a=e.elements,l=a[0],u=a[4],d=a[8],h=a[1],m=a[5],g=a[9],_=a[2],v=a[6],M=a[10];switch(t){case"XYZ":this._y=Math.asin(Vn(d,-1,1)),Math.abs(d)<.9999999?(this._x=Math.atan2(-g,M),this._z=Math.atan2(-u,l)):(this._x=Math.atan2(v,m),this._z=0);break;case"YXZ":this._x=Math.asin(-Vn(g,-1,1)),Math.abs(g)<.9999999?(this._y=Math.atan2(d,M),this._z=Math.atan2(h,m)):(this._y=Math.atan2(-_,l),this._z=0);break;case"ZXY":this._x=Math.asin(Vn(v,-1,1)),Math.abs(v)<.9999999?(this._y=Math.atan2(-_,M),this._z=Math.atan2(-u,m)):(this._y=0,this._z=Math.atan2(h,l));break;case"ZYX":this._y=Math.asin(-Vn(_,-1,1)),Math.abs(_)<.9999999?(this._x=Math.atan2(v,M),this._z=Math.atan2(h,l)):(this._x=0,this._z=Math.atan2(-u,m));break;case"YZX":this._z=Math.asin(Vn(h,-1,1)),Math.abs(h)<.9999999?(this._x=Math.atan2(-g,m),this._y=Math.atan2(-_,l)):(this._x=0,this._y=Math.atan2(d,M));break;case"XZY":this._z=Math.asin(-Vn(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(v,m),this._y=Math.atan2(d,l)):(this._x=Math.atan2(-g,M),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,r===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,r){return Um.makeRotationFromQuaternion(e),this.setFromRotationMatrix(Um,t,r)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return Fm.setFromEuler(this),this.setFromQuaternion(Fm,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}}Mi.DEFAULT_ORDER="XYZ";class Hf{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}}let Wy=0;const km=new V,Ws=new Nn,Xi=new Ft,Rl=new V,Qo=new V,Xy=new V,$y=new Nn,Om=new V(1,0,0),zm=new V(0,1,0),Bm=new V(0,0,1),Hm={type:"added"},Yy={type:"removed"},Xs={type:"childadded",child:null},fd={type:"childremoved",child:null};class Kt extends hs{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Wy++}),this.uuid=Ir(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=Kt.DEFAULT_UP.clone();const e=new V,t=new Mi,r=new Nn,a=new V(1,1,1);function l(){r.setFromEuler(t,!1)}function u(){t.setFromQuaternion(r,void 0,!1)}t._onChange(l),r._onChange(u),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:r},scale:{configurable:!0,enumerable:!0,value:a},modelViewMatrix:{value:new Ft},normalMatrix:{value:new ft}}),this.matrix=new Ft,this.matrixWorld=new Ft,this.matrixAutoUpdate=Kt.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=Kt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Hf,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ws.setFromAxisAngle(e,t),this.quaternion.multiply(Ws),this}rotateOnWorldAxis(e,t){return Ws.setFromAxisAngle(e,t),this.quaternion.premultiply(Ws),this}rotateX(e){return this.rotateOnAxis(Om,e)}rotateY(e){return this.rotateOnAxis(zm,e)}rotateZ(e){return this.rotateOnAxis(Bm,e)}translateOnAxis(e,t){return km.copy(e).applyQuaternion(this.quaternion),this.position.add(km.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(Om,e)}translateY(e){return this.translateOnAxis(zm,e)}translateZ(e){return this.translateOnAxis(Bm,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(Xi.copy(this.matrixWorld).invert())}lookAt(e,t,r){e.isVector3?Rl.copy(e):Rl.set(e,t,r);const a=this.parent;this.updateWorldMatrix(!0,!1),Qo.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?Xi.lookAt(Qo,Rl,this.up):Xi.lookAt(Rl,Qo,this.up),this.quaternion.setFromRotationMatrix(Xi),a&&(Xi.extractRotation(a.matrixWorld),Ws.setFromRotationMatrix(Xi),this.quaternion.premultiply(Ws.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(Hm),Xs.child=e,this.dispatchEvent(Xs),Xs.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let r=0;r<arguments.length;r++)this.remove(arguments[r]);return this}const t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Yy),fd.child=e,this.dispatchEvent(fd),fd.child=null),this}removeFromParent(){const e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),Xi.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),Xi.multiply(e.parent.matrixWorld)),e.applyMatrix4(Xi),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(Hm),Xs.child=e,this.dispatchEvent(Xs),Xs.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let r=0,a=this.children.length;r<a;r++){const u=this.children[r].getObjectByProperty(e,t);if(u!==void 0)return u}}getObjectsByProperty(e,t,r=[]){this[e]===t&&r.push(this);const a=this.children;for(let l=0,u=a.length;l<u;l++)a[l].getObjectsByProperty(e,t,r);return r}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Qo,e,Xy),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Qo,$y,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);const t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);const t=this.children;for(let r=0,a=t.length;r<a;r++)t[r].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);const t=this.children;for(let r=0,a=t.length;r<a;r++)t[r].traverseVisible(e)}traverseAncestors(e){const t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);const t=this.children;for(let r=0,a=t.length;r<a;r++)t[r].updateMatrixWorld(e)}updateWorldMatrix(e,t){const r=this.parent;if(e===!0&&r!==null&&r.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){const a=this.children;for(let l=0,u=a.length;l<u;l++)a[l].updateWorldMatrix(!1,!0)}}toJSON(e){const t=e===void 0||typeof e=="string",r={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},r.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});const a={};a.uuid=this.uuid,a.type=this.type,this.name!==""&&(a.name=this.name),this.castShadow===!0&&(a.castShadow=!0),this.receiveShadow===!0&&(a.receiveShadow=!0),this.visible===!1&&(a.visible=!1),this.frustumCulled===!1&&(a.frustumCulled=!1),this.renderOrder!==0&&(a.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(a.userData=this.userData),a.layers=this.layers.mask,a.matrix=this.matrix.toArray(),a.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(a.matrixAutoUpdate=!1),this.isInstancedMesh&&(a.type="InstancedMesh",a.count=this.count,a.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(a.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(a.type="BatchedMesh",a.perObjectFrustumCulled=this.perObjectFrustumCulled,a.sortObjects=this.sortObjects,a.drawRanges=this._drawRanges,a.reservedRanges=this._reservedRanges,a.visibility=this._visibility,a.active=this._active,a.bounds=this._bounds.map(d=>({boxInitialized:d.boxInitialized,boxMin:d.box.min.toArray(),boxMax:d.box.max.toArray(),sphereInitialized:d.sphereInitialized,sphereRadius:d.sphere.radius,sphereCenter:d.sphere.center.toArray()})),a.maxInstanceCount=this._maxInstanceCount,a.maxVertexCount=this._maxVertexCount,a.maxIndexCount=this._maxIndexCount,a.geometryInitialized=this._geometryInitialized,a.geometryCount=this._geometryCount,a.matricesTexture=this._matricesTexture.toJSON(e),this._colorsTexture!==null&&(a.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(a.boundingSphere={center:a.boundingSphere.center.toArray(),radius:a.boundingSphere.radius}),this.boundingBox!==null&&(a.boundingBox={min:a.boundingBox.min.toArray(),max:a.boundingBox.max.toArray()}));function l(d,h){return d[h.uuid]===void 0&&(d[h.uuid]=h.toJSON(e)),h.uuid}if(this.isScene)this.background&&(this.background.isColor?a.background=this.background.toJSON():this.background.isTexture&&(a.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(a.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){a.geometry=l(e.geometries,this.geometry);const d=this.geometry.parameters;if(d!==void 0&&d.shapes!==void 0){const h=d.shapes;if(Array.isArray(h))for(let m=0,g=h.length;m<g;m++){const _=h[m];l(e.shapes,_)}else l(e.shapes,h)}}if(this.isSkinnedMesh&&(a.bindMode=this.bindMode,a.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(l(e.skeletons,this.skeleton),a.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){const d=[];for(let h=0,m=this.material.length;h<m;h++)d.push(l(e.materials,this.material[h]));a.material=d}else a.material=l(e.materials,this.material);if(this.children.length>0){a.children=[];for(let d=0;d<this.children.length;d++)a.children.push(this.children[d].toJSON(e).object)}if(this.animations.length>0){a.animations=[];for(let d=0;d<this.animations.length;d++){const h=this.animations[d];a.animations.push(l(e.animations,h))}}if(t){const d=u(e.geometries),h=u(e.materials),m=u(e.textures),g=u(e.images),_=u(e.shapes),v=u(e.skeletons),M=u(e.animations),T=u(e.nodes);d.length>0&&(r.geometries=d),h.length>0&&(r.materials=h),m.length>0&&(r.textures=m),g.length>0&&(r.images=g),_.length>0&&(r.shapes=_),v.length>0&&(r.skeletons=v),M.length>0&&(r.animations=M),T.length>0&&(r.nodes=T)}return r.object=a,r;function u(d){const h=[];for(const m in d){const g=d[m];delete g.metadata,h.push(g)}return h}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let r=0;r<e.children.length;r++){const a=e.children[r];this.add(a.clone())}return this}}Kt.DEFAULT_UP=new V(0,1,0);Kt.DEFAULT_MATRIX_AUTO_UPDATE=!0;Kt.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;const xi=new V,$i=new V,hd=new V,Yi=new V,$s=new V,Ys=new V,Vm=new V,pd=new V,md=new V,gd=new V,xd=new qt,vd=new qt,_d=new qt;class oi{constructor(e=new V,t=new V,r=new V){this.a=e,this.b=t,this.c=r}static getNormal(e,t,r,a){a.subVectors(r,t),xi.subVectors(e,t),a.cross(xi);const l=a.lengthSq();return l>0?a.multiplyScalar(1/Math.sqrt(l)):a.set(0,0,0)}static getBarycoord(e,t,r,a,l){xi.subVectors(a,t),$i.subVectors(r,t),hd.subVectors(e,t);const u=xi.dot(xi),d=xi.dot($i),h=xi.dot(hd),m=$i.dot($i),g=$i.dot(hd),_=u*m-d*d;if(_===0)return l.set(0,0,0),null;const v=1/_,M=(m*h-d*g)*v,T=(u*g-d*h)*v;return l.set(1-M-T,T,M)}static containsPoint(e,t,r,a){return this.getBarycoord(e,t,r,a,Yi)===null?!1:Yi.x>=0&&Yi.y>=0&&Yi.x+Yi.y<=1}static getInterpolation(e,t,r,a,l,u,d,h){return this.getBarycoord(e,t,r,a,Yi)===null?(h.x=0,h.y=0,"z"in h&&(h.z=0),"w"in h&&(h.w=0),null):(h.setScalar(0),h.addScaledVector(l,Yi.x),h.addScaledVector(u,Yi.y),h.addScaledVector(d,Yi.z),h)}static getInterpolatedAttribute(e,t,r,a,l,u){return xd.setScalar(0),vd.setScalar(0),_d.setScalar(0),xd.fromBufferAttribute(e,t),vd.fromBufferAttribute(e,r),_d.fromBufferAttribute(e,a),u.setScalar(0),u.addScaledVector(xd,l.x),u.addScaledVector(vd,l.y),u.addScaledVector(_d,l.z),u}static isFrontFacing(e,t,r,a){return xi.subVectors(r,t),$i.subVectors(e,t),xi.cross($i).dot(a)<0}set(e,t,r){return this.a.copy(e),this.b.copy(t),this.c.copy(r),this}setFromPointsAndIndices(e,t,r,a){return this.a.copy(e[t]),this.b.copy(e[r]),this.c.copy(e[a]),this}setFromAttributeAndIndices(e,t,r,a){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,r),this.c.fromBufferAttribute(e,a),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return xi.subVectors(this.c,this.b),$i.subVectors(this.a,this.b),xi.cross($i).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return oi.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return oi.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,r,a,l){return oi.getInterpolation(e,this.a,this.b,this.c,t,r,a,l)}containsPoint(e){return oi.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return oi.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){const r=this.a,a=this.b,l=this.c;let u,d;$s.subVectors(a,r),Ys.subVectors(l,r),pd.subVectors(e,r);const h=$s.dot(pd),m=Ys.dot(pd);if(h<=0&&m<=0)return t.copy(r);md.subVectors(e,a);const g=$s.dot(md),_=Ys.dot(md);if(g>=0&&_<=g)return t.copy(a);const v=h*_-g*m;if(v<=0&&h>=0&&g<=0)return u=h/(h-g),t.copy(r).addScaledVector($s,u);gd.subVectors(e,l);const M=$s.dot(gd),T=Ys.dot(gd);if(T>=0&&M<=T)return t.copy(l);const b=M*m-h*T;if(b<=0&&m>=0&&T<=0)return d=m/(m-T),t.copy(r).addScaledVector(Ys,d);const y=g*T-M*_;if(y<=0&&_-g>=0&&M-T>=0)return Vm.subVectors(l,a),d=(_-g)/(_-g+(M-T)),t.copy(a).addScaledVector(Vm,d);const x=1/(y+b+v);return u=b*x,d=v*x,t.copy(r).addScaledVector($s,u).addScaledVector(Ys,d)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}}const tx={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Ar={h:0,s:0,l:0},Pl={h:0,s:0,l:0};function yd(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+(e-s)*6*t:t<1/2?e:t<2/3?s+(e-s)*6*(2/3-t):s}class mt{constructor(e,t,r){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,r)}set(e,t,r){if(t===void 0&&r===void 0){const a=e;a&&a.isColor?this.copy(a):typeof a=="number"?this.setHex(a):typeof a=="string"&&this.setStyle(a)}else this.setRGB(e,t,r);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=ri){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,Tt.toWorkingColorSpace(this,t),this}setRGB(e,t,r,a=Tt.workingColorSpace){return this.r=e,this.g=t,this.b=r,Tt.toWorkingColorSpace(this,a),this}setHSL(e,t,r,a=Tt.workingColorSpace){if(e=Ly(e,1),t=Vn(t,0,1),r=Vn(r,0,1),t===0)this.r=this.g=this.b=r;else{const l=r<=.5?r*(1+t):r+t-r*t,u=2*r-l;this.r=yd(u,l,e+1/3),this.g=yd(u,l,e),this.b=yd(u,l,e-1/3)}return Tt.toWorkingColorSpace(this,a),this}setStyle(e,t=ri){function r(l){l!==void 0&&parseFloat(l)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let a;if(a=/^(\w+)\(([^\)]*)\)/.exec(e)){let l;const u=a[1],d=a[2];switch(u){case"rgb":case"rgba":if(l=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(d))return r(l[4]),this.setRGB(Math.min(255,parseInt(l[1],10))/255,Math.min(255,parseInt(l[2],10))/255,Math.min(255,parseInt(l[3],10))/255,t);if(l=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(d))return r(l[4]),this.setRGB(Math.min(100,parseInt(l[1],10))/100,Math.min(100,parseInt(l[2],10))/100,Math.min(100,parseInt(l[3],10))/100,t);break;case"hsl":case"hsla":if(l=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(d))return r(l[4]),this.setHSL(parseFloat(l[1])/360,parseFloat(l[2])/100,parseFloat(l[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(a=/^\#([A-Fa-f\d]+)$/.exec(e)){const l=a[1],u=l.length;if(u===3)return this.setRGB(parseInt(l.charAt(0),16)/15,parseInt(l.charAt(1),16)/15,parseInt(l.charAt(2),16)/15,t);if(u===6)return this.setHex(parseInt(l,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=ri){const r=tx[e.toLowerCase()];return r!==void 0?this.setHex(r,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=Ji(e.r),this.g=Ji(e.g),this.b=Ji(e.b),this}copyLinearToSRGB(e){return this.r=lo(e.r),this.g=lo(e.g),this.b=lo(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=ri){return Tt.fromWorkingColorSpace(Mn.copy(this),e),Math.round(Vn(Mn.r*255,0,255))*65536+Math.round(Vn(Mn.g*255,0,255))*256+Math.round(Vn(Mn.b*255,0,255))}getHexString(e=ri){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=Tt.workingColorSpace){Tt.fromWorkingColorSpace(Mn.copy(this),t);const r=Mn.r,a=Mn.g,l=Mn.b,u=Math.max(r,a,l),d=Math.min(r,a,l);let h,m;const g=(d+u)/2;if(d===u)h=0,m=0;else{const _=u-d;switch(m=g<=.5?_/(u+d):_/(2-u-d),u){case r:h=(a-l)/_+(a<l?6:0);break;case a:h=(l-r)/_+2;break;case l:h=(r-a)/_+4;break}h/=6}return e.h=h,e.s=m,e.l=g,e}getRGB(e,t=Tt.workingColorSpace){return Tt.fromWorkingColorSpace(Mn.copy(this),t),e.r=Mn.r,e.g=Mn.g,e.b=Mn.b,e}getStyle(e=ri){Tt.fromWorkingColorSpace(Mn.copy(this),e);const t=Mn.r,r=Mn.g,a=Mn.b;return e!==ri?`color(${e} ${t.toFixed(3)} ${r.toFixed(3)} ${a.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(r*255)},${Math.round(a*255)})`}offsetHSL(e,t,r){return this.getHSL(Ar),this.setHSL(Ar.h+e,Ar.s+t,Ar.l+r)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,r){return this.r=e.r+(t.r-e.r)*r,this.g=e.g+(t.g-e.g)*r,this.b=e.b+(t.b-e.b)*r,this}lerpHSL(e,t){this.getHSL(Ar),e.getHSL(Pl);const r=id(Ar.h,Pl.h,t),a=id(Ar.s,Pl.s,t),l=id(Ar.l,Pl.l,t);return this.setHSL(r,a,l),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){const t=this.r,r=this.g,a=this.b,l=e.elements;return this.r=l[0]*t+l[3]*r+l[6]*a,this.g=l[1]*t+l[4]*r+l[7]*a,this.b=l[2]*t+l[5]*r+l[8]*a,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}}const Mn=new mt;mt.NAMES=tx;let qy=0;class ps extends hs{static get type(){return"Material"}get type(){return this.constructor.type}set type(e){}constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:qy++}),this.uuid=Ir(),this.name="",this.blending=oo,this.side=Ur,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=Bd,this.blendDst=Hd,this.blendEquation=as,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new mt(0,0,0),this.blendAlpha=0,this.depthFunc=co,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=bm,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=zs,this.stencilZFail=zs,this.stencilZPass=zs,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(const t in e){const r=e[t];if(r===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}const a=this[t];if(a===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}a&&a.isColor?a.set(r):a&&a.isVector3&&r&&r.isVector3?a.copy(r):this[t]=r}}toJSON(e){const t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});const r={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};r.uuid=this.uuid,r.type=this.type,this.name!==""&&(r.name=this.name),this.color&&this.color.isColor&&(r.color=this.color.getHex()),this.roughness!==void 0&&(r.roughness=this.roughness),this.metalness!==void 0&&(r.metalness=this.metalness),this.sheen!==void 0&&(r.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(r.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(r.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(r.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(r.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(r.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(r.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(r.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(r.shininess=this.shininess),this.clearcoat!==void 0&&(r.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(r.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(r.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(r.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(r.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,r.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(r.dispersion=this.dispersion),this.iridescence!==void 0&&(r.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(r.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(r.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(r.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(r.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(r.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(r.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(r.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(r.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(r.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(r.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(r.lightMap=this.lightMap.toJSON(e).uuid,r.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(r.aoMap=this.aoMap.toJSON(e).uuid,r.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(r.bumpMap=this.bumpMap.toJSON(e).uuid,r.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(r.normalMap=this.normalMap.toJSON(e).uuid,r.normalMapType=this.normalMapType,r.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(r.displacementMap=this.displacementMap.toJSON(e).uuid,r.displacementScale=this.displacementScale,r.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(r.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(r.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(r.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(r.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(r.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(r.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(r.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(r.combine=this.combine)),this.envMapRotation!==void 0&&(r.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(r.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(r.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(r.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(r.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(r.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(r.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(r.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(r.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(r.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(r.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(r.size=this.size),this.shadowSide!==null&&(r.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(r.sizeAttenuation=this.sizeAttenuation),this.blending!==oo&&(r.blending=this.blending),this.side!==Ur&&(r.side=this.side),this.vertexColors===!0&&(r.vertexColors=!0),this.opacity<1&&(r.opacity=this.opacity),this.transparent===!0&&(r.transparent=!0),this.blendSrc!==Bd&&(r.blendSrc=this.blendSrc),this.blendDst!==Hd&&(r.blendDst=this.blendDst),this.blendEquation!==as&&(r.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(r.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(r.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(r.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(r.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(r.blendAlpha=this.blendAlpha),this.depthFunc!==co&&(r.depthFunc=this.depthFunc),this.depthTest===!1&&(r.depthTest=this.depthTest),this.depthWrite===!1&&(r.depthWrite=this.depthWrite),this.colorWrite===!1&&(r.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(r.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==bm&&(r.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(r.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(r.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==zs&&(r.stencilFail=this.stencilFail),this.stencilZFail!==zs&&(r.stencilZFail=this.stencilZFail),this.stencilZPass!==zs&&(r.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(r.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(r.rotation=this.rotation),this.polygonOffset===!0&&(r.polygonOffset=!0),this.polygonOffsetFactor!==0&&(r.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(r.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(r.linewidth=this.linewidth),this.dashSize!==void 0&&(r.dashSize=this.dashSize),this.gapSize!==void 0&&(r.gapSize=this.gapSize),this.scale!==void 0&&(r.scale=this.scale),this.dithering===!0&&(r.dithering=!0),this.alphaTest>0&&(r.alphaTest=this.alphaTest),this.alphaHash===!0&&(r.alphaHash=!0),this.alphaToCoverage===!0&&(r.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(r.premultipliedAlpha=!0),this.forceSinglePass===!0&&(r.forceSinglePass=!0),this.wireframe===!0&&(r.wireframe=!0),this.wireframeLinewidth>1&&(r.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(r.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(r.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(r.flatShading=!0),this.visible===!1&&(r.visible=!1),this.toneMapped===!1&&(r.toneMapped=!1),this.fog===!1&&(r.fog=!1),Object.keys(this.userData).length>0&&(r.userData=this.userData);function a(l){const u=[];for(const d in l){const h=l[d];delete h.metadata,u.push(h)}return u}if(t){const l=a(e.textures),u=a(e.images);l.length>0&&(r.textures=l),u.length>0&&(r.images=u)}return r}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;const t=e.clippingPlanes;let r=null;if(t!==null){const a=t.length;r=new Array(a);for(let l=0;l!==a;++l)r[l]=t[l].clone()}return this.clippingPlanes=r,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}}class pc extends ps{static get type(){return"MeshBasicMaterial"}constructor(e){super(),this.isMeshBasicMaterial=!0,this.color=new mt(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Mi,this.combine=kg,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}}const Jt=new V,Nl=new ut;class Si{constructor(e,t,r=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=r,this.usage=bf,this.updateRanges=[],this.gpuType=Ki,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,r){e*=this.itemSize,r*=t.itemSize;for(let a=0,l=this.itemSize;a<l;a++)this.array[e+a]=t.array[r+a];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,r=this.count;t<r;t++)Nl.fromBufferAttribute(this,t),Nl.applyMatrix3(e),this.setXY(t,Nl.x,Nl.y);else if(this.itemSize===3)for(let t=0,r=this.count;t<r;t++)Jt.fromBufferAttribute(this,t),Jt.applyMatrix3(e),this.setXYZ(t,Jt.x,Jt.y,Jt.z);return this}applyMatrix4(e){for(let t=0,r=this.count;t<r;t++)Jt.fromBufferAttribute(this,t),Jt.applyMatrix4(e),this.setXYZ(t,Jt.x,Jt.y,Jt.z);return this}applyNormalMatrix(e){for(let t=0,r=this.count;t<r;t++)Jt.fromBufferAttribute(this,t),Jt.applyNormalMatrix(e),this.setXYZ(t,Jt.x,Jt.y,Jt.z);return this}transformDirection(e){for(let t=0,r=this.count;t<r;t++)Jt.fromBufferAttribute(this,t),Jt.transformDirection(e),this.setXYZ(t,Jt.x,Jt.y,Jt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let r=this.array[e*this.itemSize+t];return this.normalized&&(r=Li(r,this.array)),r}setComponent(e,t,r){return this.normalized&&(r=Dt(r,this.array)),this.array[e*this.itemSize+t]=r,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Li(t,this.array)),t}setX(e,t){return this.normalized&&(t=Dt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Li(t,this.array)),t}setY(e,t){return this.normalized&&(t=Dt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Li(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Dt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Li(t,this.array)),t}setW(e,t){return this.normalized&&(t=Dt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,r){return e*=this.itemSize,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array)),this.array[e+0]=t,this.array[e+1]=r,this}setXYZ(e,t,r,a){return e*=this.itemSize,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array),a=Dt(a,this.array)),this.array[e+0]=t,this.array[e+1]=r,this.array[e+2]=a,this}setXYZW(e,t,r,a,l){return e*=this.itemSize,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array),a=Dt(a,this.array),l=Dt(l,this.array)),this.array[e+0]=t,this.array[e+1]=r,this.array[e+2]=a,this.array[e+3]=l,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){const e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==bf&&(e.usage=this.usage),e}}class nx extends Si{constructor(e,t,r){super(new Uint16Array(e),t,r)}}class ix extends Si{constructor(e,t,r){super(new Uint32Array(e),t,r)}}class Ht extends Si{constructor(e,t,r){super(new Float32Array(e),t,r)}}let Zy=0;const ii=new Ft,Sd=new Kt,qs=new V,Yn=new pa,Jo=new pa,un=new V;class Xt extends hs{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:Zy++}),this.uuid=Ir(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Qg(e)?ix:nx)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,r=0){this.groups.push({start:e,count:t,materialIndex:r})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){const t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);const r=this.attributes.normal;if(r!==void 0){const l=new ft().getNormalMatrix(e);r.applyNormalMatrix(l),r.needsUpdate=!0}const a=this.attributes.tangent;return a!==void 0&&(a.transformDirection(e),a.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return ii.makeRotationFromQuaternion(e),this.applyMatrix4(ii),this}rotateX(e){return ii.makeRotationX(e),this.applyMatrix4(ii),this}rotateY(e){return ii.makeRotationY(e),this.applyMatrix4(ii),this}rotateZ(e){return ii.makeRotationZ(e),this.applyMatrix4(ii),this}translate(e,t,r){return ii.makeTranslation(e,t,r),this.applyMatrix4(ii),this}scale(e,t,r){return ii.makeScale(e,t,r),this.applyMatrix4(ii),this}lookAt(e){return Sd.lookAt(e),Sd.updateMatrix(),this.applyMatrix4(Sd.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(qs).negate(),this.translate(qs.x,qs.y,qs.z),this}setFromPoints(e){const t=this.getAttribute("position");if(t===void 0){const r=[];for(let a=0,l=e.length;a<l;a++){const u=e[a];r.push(u.x,u.y,u.z||0)}this.setAttribute("position",new Ht(r,3))}else{for(let r=0,a=t.count;r<a;r++){const l=e[r];t.setXYZ(r,l.x,l.y,l.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new pa);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new V(-1/0,-1/0,-1/0),new V(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let r=0,a=t.length;r<a;r++){const l=t[r];Yn.setFromBufferAttribute(l),this.morphTargetsRelative?(un.addVectors(this.boundingBox.min,Yn.min),this.boundingBox.expandByPoint(un),un.addVectors(this.boundingBox.max,Yn.max),this.boundingBox.expandByPoint(un)):(this.boundingBox.expandByPoint(Yn.min),this.boundingBox.expandByPoint(Yn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new hc);const e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new V,1/0);return}if(e){const r=this.boundingSphere.center;if(Yn.setFromBufferAttribute(e),t)for(let l=0,u=t.length;l<u;l++){const d=t[l];Jo.setFromBufferAttribute(d),this.morphTargetsRelative?(un.addVectors(Yn.min,Jo.min),Yn.expandByPoint(un),un.addVectors(Yn.max,Jo.max),Yn.expandByPoint(un)):(Yn.expandByPoint(Jo.min),Yn.expandByPoint(Jo.max))}Yn.getCenter(r);let a=0;for(let l=0,u=e.count;l<u;l++)un.fromBufferAttribute(e,l),a=Math.max(a,r.distanceToSquared(un));if(t)for(let l=0,u=t.length;l<u;l++){const d=t[l],h=this.morphTargetsRelative;for(let m=0,g=d.count;m<g;m++)un.fromBufferAttribute(d,m),h&&(qs.fromBufferAttribute(e,m),un.add(qs)),a=Math.max(a,r.distanceToSquared(un))}this.boundingSphere.radius=Math.sqrt(a),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){const e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}const r=t.position,a=t.normal,l=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new Si(new Float32Array(4*r.count),4));const u=this.getAttribute("tangent"),d=[],h=[];for(let B=0;B<r.count;B++)d[B]=new V,h[B]=new V;const m=new V,g=new V,_=new V,v=new ut,M=new ut,T=new ut,b=new V,y=new V;function x(B,P,A){m.fromBufferAttribute(r,B),g.fromBufferAttribute(r,P),_.fromBufferAttribute(r,A),v.fromBufferAttribute(l,B),M.fromBufferAttribute(l,P),T.fromBufferAttribute(l,A),g.sub(m),_.sub(m),M.sub(v),T.sub(v);const H=1/(M.x*T.y-T.x*M.y);isFinite(H)&&(b.copy(g).multiplyScalar(T.y).addScaledVector(_,-M.y).multiplyScalar(H),y.copy(_).multiplyScalar(M.x).addScaledVector(g,-T.x).multiplyScalar(H),d[B].add(b),d[P].add(b),d[A].add(b),h[B].add(y),h[P].add(y),h[A].add(y))}let L=this.groups;L.length===0&&(L=[{start:0,count:e.count}]);for(let B=0,P=L.length;B<P;++B){const A=L[B],H=A.start,te=A.count;for(let J=H,oe=H+te;J<oe;J+=3)x(e.getX(J+0),e.getX(J+1),e.getX(J+2))}const N=new V,w=new V,O=new V,D=new V;function F(B){O.fromBufferAttribute(a,B),D.copy(O);const P=d[B];N.copy(P),N.sub(O.multiplyScalar(O.dot(P))).normalize(),w.crossVectors(D,P);const H=w.dot(h[B])<0?-1:1;u.setXYZW(B,N.x,N.y,N.z,H)}for(let B=0,P=L.length;B<P;++B){const A=L[B],H=A.start,te=A.count;for(let J=H,oe=H+te;J<oe;J+=3)F(e.getX(J+0)),F(e.getX(J+1)),F(e.getX(J+2))}}computeVertexNormals(){const e=this.index,t=this.getAttribute("position");if(t!==void 0){let r=this.getAttribute("normal");if(r===void 0)r=new Si(new Float32Array(t.count*3),3),this.setAttribute("normal",r);else for(let v=0,M=r.count;v<M;v++)r.setXYZ(v,0,0,0);const a=new V,l=new V,u=new V,d=new V,h=new V,m=new V,g=new V,_=new V;if(e)for(let v=0,M=e.count;v<M;v+=3){const T=e.getX(v+0),b=e.getX(v+1),y=e.getX(v+2);a.fromBufferAttribute(t,T),l.fromBufferAttribute(t,b),u.fromBufferAttribute(t,y),g.subVectors(u,l),_.subVectors(a,l),g.cross(_),d.fromBufferAttribute(r,T),h.fromBufferAttribute(r,b),m.fromBufferAttribute(r,y),d.add(g),h.add(g),m.add(g),r.setXYZ(T,d.x,d.y,d.z),r.setXYZ(b,h.x,h.y,h.z),r.setXYZ(y,m.x,m.y,m.z)}else for(let v=0,M=t.count;v<M;v+=3)a.fromBufferAttribute(t,v+0),l.fromBufferAttribute(t,v+1),u.fromBufferAttribute(t,v+2),g.subVectors(u,l),_.subVectors(a,l),g.cross(_),r.setXYZ(v+0,g.x,g.y,g.z),r.setXYZ(v+1,g.x,g.y,g.z),r.setXYZ(v+2,g.x,g.y,g.z);this.normalizeNormals(),r.needsUpdate=!0}}normalizeNormals(){const e=this.attributes.normal;for(let t=0,r=e.count;t<r;t++)un.fromBufferAttribute(e,t),un.normalize(),e.setXYZ(t,un.x,un.y,un.z)}toNonIndexed(){function e(d,h){const m=d.array,g=d.itemSize,_=d.normalized,v=new m.constructor(h.length*g);let M=0,T=0;for(let b=0,y=h.length;b<y;b++){d.isInterleavedBufferAttribute?M=h[b]*d.data.stride+d.offset:M=h[b]*g;for(let x=0;x<g;x++)v[T++]=m[M++]}return new Si(v,g,_)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;const t=new Xt,r=this.index.array,a=this.attributes;for(const d in a){const h=a[d],m=e(h,r);t.setAttribute(d,m)}const l=this.morphAttributes;for(const d in l){const h=[],m=l[d];for(let g=0,_=m.length;g<_;g++){const v=m[g],M=e(v,r);h.push(M)}t.morphAttributes[d]=h}t.morphTargetsRelative=this.morphTargetsRelative;const u=this.groups;for(let d=0,h=u.length;d<h;d++){const m=u[d];t.addGroup(m.start,m.count,m.materialIndex)}return t}toJSON(){const e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){const h=this.parameters;for(const m in h)h[m]!==void 0&&(e[m]=h[m]);return e}e.data={attributes:{}};const t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});const r=this.attributes;for(const h in r){const m=r[h];e.data.attributes[h]=m.toJSON(e.data)}const a={};let l=!1;for(const h in this.morphAttributes){const m=this.morphAttributes[h],g=[];for(let _=0,v=m.length;_<v;_++){const M=m[_];g.push(M.toJSON(e.data))}g.length>0&&(a[h]=g,l=!0)}l&&(e.data.morphAttributes=a,e.data.morphTargetsRelative=this.morphTargetsRelative);const u=this.groups;u.length>0&&(e.data.groups=JSON.parse(JSON.stringify(u)));const d=this.boundingSphere;return d!==null&&(e.data.boundingSphere={center:d.center.toArray(),radius:d.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;const t={};this.name=e.name;const r=e.index;r!==null&&this.setIndex(r.clone(t));const a=e.attributes;for(const m in a){const g=a[m];this.setAttribute(m,g.clone(t))}const l=e.morphAttributes;for(const m in l){const g=[],_=l[m];for(let v=0,M=_.length;v<M;v++)g.push(_[v].clone(t));this.morphAttributes[m]=g}this.morphTargetsRelative=e.morphTargetsRelative;const u=e.groups;for(let m=0,g=u.length;m<g;m++){const _=u[m];this.addGroup(_.start,_.count,_.materialIndex)}const d=e.boundingBox;d!==null&&(this.boundingBox=d.clone());const h=e.boundingSphere;return h!==null&&(this.boundingSphere=h.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}}const Gm=new Ft,Jr=new Bf,Ll=new hc,jm=new V,Dl=new V,Il=new V,Ul=new V,Md=new V,Fl=new V,Wm=new V,kl=new V;class Fe extends Kt{constructor(e=new Xt,t=new pc){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){const t=this.geometry.morphAttributes,r=Object.keys(t);if(r.length>0){const a=t[r[0]];if(a!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let l=0,u=a.length;l<u;l++){const d=a[l].name||String(l);this.morphTargetInfluences.push(0),this.morphTargetDictionary[d]=l}}}}getVertexPosition(e,t){const r=this.geometry,a=r.attributes.position,l=r.morphAttributes.position,u=r.morphTargetsRelative;t.fromBufferAttribute(a,e);const d=this.morphTargetInfluences;if(l&&d){Fl.set(0,0,0);for(let h=0,m=l.length;h<m;h++){const g=d[h],_=l[h];g!==0&&(Md.fromBufferAttribute(_,e),u?Fl.addScaledVector(Md,g):Fl.addScaledVector(Md.sub(t),g))}t.add(Fl)}return t}raycast(e,t){const r=this.geometry,a=this.material,l=this.matrixWorld;a!==void 0&&(r.boundingSphere===null&&r.computeBoundingSphere(),Ll.copy(r.boundingSphere),Ll.applyMatrix4(l),Jr.copy(e.ray).recast(e.near),!(Ll.containsPoint(Jr.origin)===!1&&(Jr.intersectSphere(Ll,jm)===null||Jr.origin.distanceToSquared(jm)>(e.far-e.near)**2))&&(Gm.copy(l).invert(),Jr.copy(e.ray).applyMatrix4(Gm),!(r.boundingBox!==null&&Jr.intersectsBox(r.boundingBox)===!1)&&this._computeIntersections(e,t,Jr)))}_computeIntersections(e,t,r){let a;const l=this.geometry,u=this.material,d=l.index,h=l.attributes.position,m=l.attributes.uv,g=l.attributes.uv1,_=l.attributes.normal,v=l.groups,M=l.drawRange;if(d!==null)if(Array.isArray(u))for(let T=0,b=v.length;T<b;T++){const y=v[T],x=u[y.materialIndex],L=Math.max(y.start,M.start),N=Math.min(d.count,Math.min(y.start+y.count,M.start+M.count));for(let w=L,O=N;w<O;w+=3){const D=d.getX(w),F=d.getX(w+1),B=d.getX(w+2);a=Ol(this,x,e,r,m,g,_,D,F,B),a&&(a.faceIndex=Math.floor(w/3),a.face.materialIndex=y.materialIndex,t.push(a))}}else{const T=Math.max(0,M.start),b=Math.min(d.count,M.start+M.count);for(let y=T,x=b;y<x;y+=3){const L=d.getX(y),N=d.getX(y+1),w=d.getX(y+2);a=Ol(this,u,e,r,m,g,_,L,N,w),a&&(a.faceIndex=Math.floor(y/3),t.push(a))}}else if(h!==void 0)if(Array.isArray(u))for(let T=0,b=v.length;T<b;T++){const y=v[T],x=u[y.materialIndex],L=Math.max(y.start,M.start),N=Math.min(h.count,Math.min(y.start+y.count,M.start+M.count));for(let w=L,O=N;w<O;w+=3){const D=w,F=w+1,B=w+2;a=Ol(this,x,e,r,m,g,_,D,F,B),a&&(a.faceIndex=Math.floor(w/3),a.face.materialIndex=y.materialIndex,t.push(a))}}else{const T=Math.max(0,M.start),b=Math.min(h.count,M.start+M.count);for(let y=T,x=b;y<x;y+=3){const L=y,N=y+1,w=y+2;a=Ol(this,u,e,r,m,g,_,L,N,w),a&&(a.faceIndex=Math.floor(y/3),t.push(a))}}}}function Ky(s,e,t,r,a,l,u,d){let h;if(e.side===Ln?h=r.intersectTriangle(u,l,a,!0,d):h=r.intersectTriangle(a,l,u,e.side===Ur,d),h===null)return null;kl.copy(d),kl.applyMatrix4(s.matrixWorld);const m=t.ray.origin.distanceTo(kl);return m<t.near||m>t.far?null:{distance:m,point:kl.clone(),object:s}}function Ol(s,e,t,r,a,l,u,d,h,m){s.getVertexPosition(d,Dl),s.getVertexPosition(h,Il),s.getVertexPosition(m,Ul);const g=Ky(s,e,t,r,Dl,Il,Ul,Wm);if(g){const _=new V;oi.getBarycoord(Wm,Dl,Il,Ul,_),a&&(g.uv=oi.getInterpolatedAttribute(a,d,h,m,_,new ut)),l&&(g.uv1=oi.getInterpolatedAttribute(l,d,h,m,_,new ut)),u&&(g.normal=oi.getInterpolatedAttribute(u,d,h,m,_,new V),g.normal.dot(r.direction)>0&&g.normal.multiplyScalar(-1));const v={a:d,b:h,c:m,normal:new V,materialIndex:0};oi.getNormal(Dl,Il,Ul,v.normal),g.face=v,g.barycoord=_}return g}class Yt extends Xt{constructor(e=1,t=1,r=1,a=1,l=1,u=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:r,widthSegments:a,heightSegments:l,depthSegments:u};const d=this;a=Math.floor(a),l=Math.floor(l),u=Math.floor(u);const h=[],m=[],g=[],_=[];let v=0,M=0;T("z","y","x",-1,-1,r,t,e,u,l,0),T("z","y","x",1,-1,r,t,-e,u,l,1),T("x","z","y",1,1,e,r,t,a,u,2),T("x","z","y",1,-1,e,r,-t,a,u,3),T("x","y","z",1,-1,e,t,r,a,l,4),T("x","y","z",-1,-1,e,t,-r,a,l,5),this.setIndex(h),this.setAttribute("position",new Ht(m,3)),this.setAttribute("normal",new Ht(g,3)),this.setAttribute("uv",new Ht(_,2));function T(b,y,x,L,N,w,O,D,F,B,P){const A=w/F,H=O/B,te=w/2,J=O/2,oe=D/2,ce=F+1,j=B+1;let Q=0,z=0;const X=new V;for(let q=0;q<j;q++){const I=q*H-J;for(let ie=0;ie<ce;ie++){const be=ie*A-te;X[b]=be*L,X[y]=I*N,X[x]=oe,m.push(X.x,X.y,X.z),X[b]=0,X[y]=0,X[x]=D>0?1:-1,g.push(X.x,X.y,X.z),_.push(ie/F),_.push(1-q/B),Q+=1}}for(let q=0;q<B;q++)for(let I=0;I<F;I++){const ie=v+I+ce*q,be=v+I+ce*(q+1),ne=v+(I+1)+ce*(q+1),fe=v+(I+1)+ce*q;h.push(ie,be,fe),h.push(be,ne,fe),z+=6}d.addGroup(M,z,P),M+=z,v+=Q}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Yt(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}}function mo(s){const e={};for(const t in s){e[t]={};for(const r in s[t]){const a=s[t][r];a&&(a.isColor||a.isMatrix3||a.isMatrix4||a.isVector2||a.isVector3||a.isVector4||a.isTexture||a.isQuaternion)?a.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][r]=null):e[t][r]=a.clone():Array.isArray(a)?e[t][r]=a.slice():e[t][r]=a}}return e}function Pn(s){const e={};for(let t=0;t<s.length;t++){const r=mo(s[t]);for(const a in r)e[a]=r[a]}return e}function Qy(s){const e=[];for(let t=0;t<s.length;t++)e.push(s[t].clone());return e}function rx(s){const e=s.getRenderTarget();return e===null?s.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:Tt.workingColorSpace}const Jy={clone:mo,merge:Pn};var eS=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,tS=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`;class tr extends ps{static get type(){return"ShaderMaterial"}constructor(e){super(),this.isShaderMaterial=!0,this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=eS,this.fragmentShader=tS,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=mo(e.uniforms),this.uniformsGroups=Qy(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){const t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(const a in this.uniforms){const u=this.uniforms[a].value;u&&u.isTexture?t.uniforms[a]={type:"t",value:u.toJSON(e).uuid}:u&&u.isColor?t.uniforms[a]={type:"c",value:u.getHex()}:u&&u.isVector2?t.uniforms[a]={type:"v2",value:u.toArray()}:u&&u.isVector3?t.uniforms[a]={type:"v3",value:u.toArray()}:u&&u.isVector4?t.uniforms[a]={type:"v4",value:u.toArray()}:u&&u.isMatrix3?t.uniforms[a]={type:"m3",value:u.toArray()}:u&&u.isMatrix4?t.uniforms[a]={type:"m4",value:u.toArray()}:t.uniforms[a]={value:u}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;const r={};for(const a in this.extensions)this.extensions[a]===!0&&(r[a]=!0);return Object.keys(r).length>0&&(t.extensions=r),t}}class sx extends Kt{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Ft,this.projectionMatrix=new Ft,this.projectionMatrixInverse=new Ft,this.coordinateSystem=Qi}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}}const Cr=new V,Xm=new ut,$m=new ut;class si extends sx{constructor(e=50,t=1,r=.1,a=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=r,this.far=a,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){const t=.5*this.getFilmHeight()/e;this.fov=Af*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){const e=Math.tan(nd*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return Af*2*Math.atan(Math.tan(nd*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,r){Cr.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Cr.x,Cr.y).multiplyScalar(-e/Cr.z),Cr.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),r.set(Cr.x,Cr.y).multiplyScalar(-e/Cr.z)}getViewSize(e,t){return this.getViewBounds(e,Xm,$m),t.subVectors($m,Xm)}setViewOffset(e,t,r,a,l,u){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=r,this.view.offsetY=a,this.view.width=l,this.view.height=u,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=this.near;let t=e*Math.tan(nd*.5*this.fov)/this.zoom,r=2*t,a=this.aspect*r,l=-.5*a;const u=this.view;if(this.view!==null&&this.view.enabled){const h=u.fullWidth,m=u.fullHeight;l+=u.offsetX*a/h,t-=u.offsetY*r/m,a*=u.width/h,r*=u.height/m}const d=this.filmOffset;d!==0&&(l+=e*d/this.getFilmWidth()),this.projectionMatrix.makePerspective(l,l+a,t,t-r,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}}const Zs=-90,Ks=1;class nS extends Kt{constructor(e,t,r){super(),this.type="CubeCamera",this.renderTarget=r,this.coordinateSystem=null,this.activeMipmapLevel=0;const a=new si(Zs,Ks,e,t);a.layers=this.layers,this.add(a);const l=new si(Zs,Ks,e,t);l.layers=this.layers,this.add(l);const u=new si(Zs,Ks,e,t);u.layers=this.layers,this.add(u);const d=new si(Zs,Ks,e,t);d.layers=this.layers,this.add(d);const h=new si(Zs,Ks,e,t);h.layers=this.layers,this.add(h);const m=new si(Zs,Ks,e,t);m.layers=this.layers,this.add(m)}updateCoordinateSystem(){const e=this.coordinateSystem,t=this.children.concat(),[r,a,l,u,d,h]=t;for(const m of t)this.remove(m);if(e===Qi)r.up.set(0,1,0),r.lookAt(1,0,0),a.up.set(0,1,0),a.lookAt(-1,0,0),l.up.set(0,0,-1),l.lookAt(0,1,0),u.up.set(0,0,1),u.lookAt(0,-1,0),d.up.set(0,1,0),d.lookAt(0,0,1),h.up.set(0,1,0),h.lookAt(0,0,-1);else if(e===sc)r.up.set(0,-1,0),r.lookAt(-1,0,0),a.up.set(0,-1,0),a.lookAt(1,0,0),l.up.set(0,0,1),l.lookAt(0,1,0),u.up.set(0,0,-1),u.lookAt(0,-1,0),d.up.set(0,-1,0),d.lookAt(0,0,1),h.up.set(0,-1,0),h.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(const m of t)this.add(m),m.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();const{renderTarget:r,activeMipmapLevel:a}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());const[l,u,d,h,m,g]=this.children,_=e.getRenderTarget(),v=e.getActiveCubeFace(),M=e.getActiveMipmapLevel(),T=e.xr.enabled;e.xr.enabled=!1;const b=r.texture.generateMipmaps;r.texture.generateMipmaps=!1,e.setRenderTarget(r,0,a),e.render(t,l),e.setRenderTarget(r,1,a),e.render(t,u),e.setRenderTarget(r,2,a),e.render(t,d),e.setRenderTarget(r,3,a),e.render(t,h),e.setRenderTarget(r,4,a),e.render(t,m),r.texture.generateMipmaps=b,e.setRenderTarget(r,5,a),e.render(t,g),e.setRenderTarget(_,v,M),e.xr.enabled=T,r.texture.needsPMREMUpdate=!0}}class ox extends Dn{constructor(e,t,r,a,l,u,d,h,m,g){e=e!==void 0?e:[],t=t!==void 0?t:uo,super(e,t,r,a,l,u,d,h,m,g),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}}class iS extends fs{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;const r={width:e,height:e,depth:1},a=[r,r,r,r,r,r];this.texture=new ox(a,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:vi}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const r={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},a=new Yt(5,5,5),l=new tr({name:"CubemapFromEquirect",uniforms:mo(r.uniforms),vertexShader:r.vertexShader,fragmentShader:r.fragmentShader,side:Ln,blending:Lr});l.uniforms.tEquirect.value=t;const u=new Fe(a,l),d=t.minFilter;return t.minFilter===us&&(t.minFilter=vi),new nS(1,10,this).update(e,u),t.minFilter=d,u.geometry.dispose(),u.material.dispose(),this}clear(e,t,r,a){const l=e.getRenderTarget();for(let u=0;u<6;u++)e.setRenderTarget(this,u),e.clear(t,r,a);e.setRenderTarget(l)}}const Ed=new V,rS=new V,sS=new ft;class rs{constructor(e=new V(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,r,a){return this.normal.set(e,t,r),this.constant=a,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,r){const a=Ed.subVectors(r,t).cross(rS.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(a,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){const e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){const r=e.delta(Ed),a=this.normal.dot(r);if(a===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;const l=-(e.start.dot(this.normal)+this.constant)/a;return l<0||l>1?null:t.copy(e.start).addScaledVector(r,l)}intersectsLine(e){const t=this.distanceToPoint(e.start),r=this.distanceToPoint(e.end);return t<0&&r>0||r<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){const r=t||sS.getNormalMatrix(e),a=this.coplanarPoint(Ed).applyMatrix4(e),l=this.normal.applyMatrix3(r).normalize();return this.constant=-a.dot(l),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}}const es=new hc,zl=new V;class Vf{constructor(e=new rs,t=new rs,r=new rs,a=new rs,l=new rs,u=new rs){this.planes=[e,t,r,a,l,u]}set(e,t,r,a,l,u){const d=this.planes;return d[0].copy(e),d[1].copy(t),d[2].copy(r),d[3].copy(a),d[4].copy(l),d[5].copy(u),this}copy(e){const t=this.planes;for(let r=0;r<6;r++)t[r].copy(e.planes[r]);return this}setFromProjectionMatrix(e,t=Qi){const r=this.planes,a=e.elements,l=a[0],u=a[1],d=a[2],h=a[3],m=a[4],g=a[5],_=a[6],v=a[7],M=a[8],T=a[9],b=a[10],y=a[11],x=a[12],L=a[13],N=a[14],w=a[15];if(r[0].setComponents(h-l,v-m,y-M,w-x).normalize(),r[1].setComponents(h+l,v+m,y+M,w+x).normalize(),r[2].setComponents(h+u,v+g,y+T,w+L).normalize(),r[3].setComponents(h-u,v-g,y-T,w-L).normalize(),r[4].setComponents(h-d,v-_,y-b,w-N).normalize(),t===Qi)r[5].setComponents(h+d,v+_,y+b,w+N).normalize();else if(t===sc)r[5].setComponents(d,_,b,N).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),es.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{const t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),es.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(es)}intersectsSprite(e){return es.center.set(0,0,0),es.radius=.7071067811865476,es.applyMatrix4(e.matrixWorld),this.intersectsSphere(es)}intersectsSphere(e){const t=this.planes,r=e.center,a=-e.radius;for(let l=0;l<6;l++)if(t[l].distanceToPoint(r)<a)return!1;return!0}intersectsBox(e){const t=this.planes;for(let r=0;r<6;r++){const a=t[r];if(zl.x=a.normal.x>0?e.max.x:e.min.x,zl.y=a.normal.y>0?e.max.y:e.min.y,zl.z=a.normal.z>0?e.max.z:e.min.z,a.distanceToPoint(zl)<0)return!1}return!0}containsPoint(e){const t=this.planes;for(let r=0;r<6;r++)if(t[r].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}}function ax(){let s=null,e=!1,t=null,r=null;function a(l,u){t(l,u),r=s.requestAnimationFrame(a)}return{start:function(){e!==!0&&t!==null&&(r=s.requestAnimationFrame(a),e=!0)},stop:function(){s.cancelAnimationFrame(r),e=!1},setAnimationLoop:function(l){t=l},setContext:function(l){s=l}}}function oS(s){const e=new WeakMap;function t(d,h){const m=d.array,g=d.usage,_=m.byteLength,v=s.createBuffer();s.bindBuffer(h,v),s.bufferData(h,m,g),d.onUploadCallback();let M;if(m instanceof Float32Array)M=s.FLOAT;else if(m instanceof Uint16Array)d.isFloat16BufferAttribute?M=s.HALF_FLOAT:M=s.UNSIGNED_SHORT;else if(m instanceof Int16Array)M=s.SHORT;else if(m instanceof Uint32Array)M=s.UNSIGNED_INT;else if(m instanceof Int32Array)M=s.INT;else if(m instanceof Int8Array)M=s.BYTE;else if(m instanceof Uint8Array)M=s.UNSIGNED_BYTE;else if(m instanceof Uint8ClampedArray)M=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+m);return{buffer:v,type:M,bytesPerElement:m.BYTES_PER_ELEMENT,version:d.version,size:_}}function r(d,h,m){const g=h.array,_=h.updateRanges;if(s.bindBuffer(m,d),_.length===0)s.bufferSubData(m,0,g);else{_.sort((M,T)=>M.start-T.start);let v=0;for(let M=1;M<_.length;M++){const T=_[v],b=_[M];b.start<=T.start+T.count+1?T.count=Math.max(T.count,b.start+b.count-T.start):(++v,_[v]=b)}_.length=v+1;for(let M=0,T=_.length;M<T;M++){const b=_[M];s.bufferSubData(m,b.start*g.BYTES_PER_ELEMENT,g,b.start,b.count)}h.clearUpdateRanges()}h.onUploadCallback()}function a(d){return d.isInterleavedBufferAttribute&&(d=d.data),e.get(d)}function l(d){d.isInterleavedBufferAttribute&&(d=d.data);const h=e.get(d);h&&(s.deleteBuffer(h.buffer),e.delete(d))}function u(d,h){if(d.isInterleavedBufferAttribute&&(d=d.data),d.isGLBufferAttribute){const g=e.get(d);(!g||g.version<d.version)&&e.set(d,{buffer:d.buffer,type:d.type,bytesPerElement:d.elementSize,version:d.version});return}const m=e.get(d);if(m===void 0)e.set(d,t(d,h));else if(m.version<d.version){if(m.size!==d.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");r(m.buffer,d,h),m.version=d.version}}return{get:a,remove:l,update:u}}class ma extends Xt{constructor(e=1,t=1,r=1,a=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:r,heightSegments:a};const l=e/2,u=t/2,d=Math.floor(r),h=Math.floor(a),m=d+1,g=h+1,_=e/d,v=t/h,M=[],T=[],b=[],y=[];for(let x=0;x<g;x++){const L=x*v-u;for(let N=0;N<m;N++){const w=N*_-l;T.push(w,-L,0),b.push(0,0,1),y.push(N/d),y.push(1-x/h)}}for(let x=0;x<h;x++)for(let L=0;L<d;L++){const N=L+m*x,w=L+m*(x+1),O=L+1+m*(x+1),D=L+1+m*x;M.push(N,w,D),M.push(w,O,D)}this.setIndex(M),this.setAttribute("position",new Ht(T,3)),this.setAttribute("normal",new Ht(b,3)),this.setAttribute("uv",new Ht(y,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new ma(e.width,e.height,e.widthSegments,e.heightSegments)}}var aS=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,lS=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,cS=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,uS=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,dS=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,fS=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,hS=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,pS=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,mS=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,gS=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,xS=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,vS=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,_S=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,yS=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,SS=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,MS=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,ES=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,wS=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,TS=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,bS=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,AS=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,CS=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,RS=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,PS=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,NS=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,LS=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,DS=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,IS=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,US=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,FS=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,kS="gl_FragColor = linearToOutputTexel( gl_FragColor );",OS=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,zS=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,BS=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,HS=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,VS=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,GS=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,jS=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,WS=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,XS=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,$S=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,YS=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,qS=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,ZS=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,KS=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,QS=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,JS=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,e1=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,t1=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,n1=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,i1=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,r1=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,s1=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,o1=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,a1=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,l1=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,c1=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,u1=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,d1=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,f1=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,h1=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,p1=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,m1=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,g1=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,x1=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,v1=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,_1=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,y1=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,S1=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,M1=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,E1=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,w1=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,T1=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,b1=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,A1=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,C1=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,R1=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,P1=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,N1=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,L1=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,D1=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,I1=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,U1=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,F1=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,k1=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,O1=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,z1=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,B1=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,H1=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,V1=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,G1=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,j1=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,W1=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,X1=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,$1=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,Y1=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,q1=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,Z1=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,K1=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,Q1=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,J1=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,eM=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,tM=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
		
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
		
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		
		#else
		
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,nM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,iM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,rM=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,sM=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const oM=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,aM=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,lM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,cM=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,uM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,dM=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,fM=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,hM=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,pM=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,mM=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,gM=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,xM=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,vM=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,_M=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,yM=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,SM=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,MM=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,EM=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,wM=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,TM=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,bM=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,AM=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,CM=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,RM=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,PM=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,NM=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,LM=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,DM=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,IM=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,UM=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,FM=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,kM=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,OM=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,zM=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,ht={alphahash_fragment:aS,alphahash_pars_fragment:lS,alphamap_fragment:cS,alphamap_pars_fragment:uS,alphatest_fragment:dS,alphatest_pars_fragment:fS,aomap_fragment:hS,aomap_pars_fragment:pS,batching_pars_vertex:mS,batching_vertex:gS,begin_vertex:xS,beginnormal_vertex:vS,bsdfs:_S,iridescence_fragment:yS,bumpmap_pars_fragment:SS,clipping_planes_fragment:MS,clipping_planes_pars_fragment:ES,clipping_planes_pars_vertex:wS,clipping_planes_vertex:TS,color_fragment:bS,color_pars_fragment:AS,color_pars_vertex:CS,color_vertex:RS,common:PS,cube_uv_reflection_fragment:NS,defaultnormal_vertex:LS,displacementmap_pars_vertex:DS,displacementmap_vertex:IS,emissivemap_fragment:US,emissivemap_pars_fragment:FS,colorspace_fragment:kS,colorspace_pars_fragment:OS,envmap_fragment:zS,envmap_common_pars_fragment:BS,envmap_pars_fragment:HS,envmap_pars_vertex:VS,envmap_physical_pars_fragment:JS,envmap_vertex:GS,fog_vertex:jS,fog_pars_vertex:WS,fog_fragment:XS,fog_pars_fragment:$S,gradientmap_pars_fragment:YS,lightmap_pars_fragment:qS,lights_lambert_fragment:ZS,lights_lambert_pars_fragment:KS,lights_pars_begin:QS,lights_toon_fragment:e1,lights_toon_pars_fragment:t1,lights_phong_fragment:n1,lights_phong_pars_fragment:i1,lights_physical_fragment:r1,lights_physical_pars_fragment:s1,lights_fragment_begin:o1,lights_fragment_maps:a1,lights_fragment_end:l1,logdepthbuf_fragment:c1,logdepthbuf_pars_fragment:u1,logdepthbuf_pars_vertex:d1,logdepthbuf_vertex:f1,map_fragment:h1,map_pars_fragment:p1,map_particle_fragment:m1,map_particle_pars_fragment:g1,metalnessmap_fragment:x1,metalnessmap_pars_fragment:v1,morphinstance_vertex:_1,morphcolor_vertex:y1,morphnormal_vertex:S1,morphtarget_pars_vertex:M1,morphtarget_vertex:E1,normal_fragment_begin:w1,normal_fragment_maps:T1,normal_pars_fragment:b1,normal_pars_vertex:A1,normal_vertex:C1,normalmap_pars_fragment:R1,clearcoat_normal_fragment_begin:P1,clearcoat_normal_fragment_maps:N1,clearcoat_pars_fragment:L1,iridescence_pars_fragment:D1,opaque_fragment:I1,packing:U1,premultiplied_alpha_fragment:F1,project_vertex:k1,dithering_fragment:O1,dithering_pars_fragment:z1,roughnessmap_fragment:B1,roughnessmap_pars_fragment:H1,shadowmap_pars_fragment:V1,shadowmap_pars_vertex:G1,shadowmap_vertex:j1,shadowmask_pars_fragment:W1,skinbase_vertex:X1,skinning_pars_vertex:$1,skinning_vertex:Y1,skinnormal_vertex:q1,specularmap_fragment:Z1,specularmap_pars_fragment:K1,tonemapping_fragment:Q1,tonemapping_pars_fragment:J1,transmission_fragment:eM,transmission_pars_fragment:tM,uv_pars_fragment:nM,uv_pars_vertex:iM,uv_vertex:rM,worldpos_vertex:sM,background_vert:oM,background_frag:aM,backgroundCube_vert:lM,backgroundCube_frag:cM,cube_vert:uM,cube_frag:dM,depth_vert:fM,depth_frag:hM,distanceRGBA_vert:pM,distanceRGBA_frag:mM,equirect_vert:gM,equirect_frag:xM,linedashed_vert:vM,linedashed_frag:_M,meshbasic_vert:yM,meshbasic_frag:SM,meshlambert_vert:MM,meshlambert_frag:EM,meshmatcap_vert:wM,meshmatcap_frag:TM,meshnormal_vert:bM,meshnormal_frag:AM,meshphong_vert:CM,meshphong_frag:RM,meshphysical_vert:PM,meshphysical_frag:NM,meshtoon_vert:LM,meshtoon_frag:DM,points_vert:IM,points_frag:UM,shadow_vert:FM,shadow_frag:kM,sprite_vert:OM,sprite_frag:zM},Ne={common:{diffuse:{value:new mt(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new ft},alphaMap:{value:null},alphaMapTransform:{value:new ft},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new ft}},envmap:{envMap:{value:null},envMapRotation:{value:new ft},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new ft}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new ft}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new ft},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new ft},normalScale:{value:new ut(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new ft},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new ft}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new ft}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new ft}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new mt(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new mt(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new ft},alphaTest:{value:0},uvTransform:{value:new ft}},sprite:{diffuse:{value:new mt(16777215)},opacity:{value:1},center:{value:new ut(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new ft},alphaMap:{value:null},alphaMapTransform:{value:new ft},alphaTest:{value:0}}},Pi={basic:{uniforms:Pn([Ne.common,Ne.specularmap,Ne.envmap,Ne.aomap,Ne.lightmap,Ne.fog]),vertexShader:ht.meshbasic_vert,fragmentShader:ht.meshbasic_frag},lambert:{uniforms:Pn([Ne.common,Ne.specularmap,Ne.envmap,Ne.aomap,Ne.lightmap,Ne.emissivemap,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,Ne.fog,Ne.lights,{emissive:{value:new mt(0)}}]),vertexShader:ht.meshlambert_vert,fragmentShader:ht.meshlambert_frag},phong:{uniforms:Pn([Ne.common,Ne.specularmap,Ne.envmap,Ne.aomap,Ne.lightmap,Ne.emissivemap,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,Ne.fog,Ne.lights,{emissive:{value:new mt(0)},specular:{value:new mt(1118481)},shininess:{value:30}}]),vertexShader:ht.meshphong_vert,fragmentShader:ht.meshphong_frag},standard:{uniforms:Pn([Ne.common,Ne.envmap,Ne.aomap,Ne.lightmap,Ne.emissivemap,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,Ne.roughnessmap,Ne.metalnessmap,Ne.fog,Ne.lights,{emissive:{value:new mt(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:ht.meshphysical_vert,fragmentShader:ht.meshphysical_frag},toon:{uniforms:Pn([Ne.common,Ne.aomap,Ne.lightmap,Ne.emissivemap,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,Ne.gradientmap,Ne.fog,Ne.lights,{emissive:{value:new mt(0)}}]),vertexShader:ht.meshtoon_vert,fragmentShader:ht.meshtoon_frag},matcap:{uniforms:Pn([Ne.common,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,Ne.fog,{matcap:{value:null}}]),vertexShader:ht.meshmatcap_vert,fragmentShader:ht.meshmatcap_frag},points:{uniforms:Pn([Ne.points,Ne.fog]),vertexShader:ht.points_vert,fragmentShader:ht.points_frag},dashed:{uniforms:Pn([Ne.common,Ne.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:ht.linedashed_vert,fragmentShader:ht.linedashed_frag},depth:{uniforms:Pn([Ne.common,Ne.displacementmap]),vertexShader:ht.depth_vert,fragmentShader:ht.depth_frag},normal:{uniforms:Pn([Ne.common,Ne.bumpmap,Ne.normalmap,Ne.displacementmap,{opacity:{value:1}}]),vertexShader:ht.meshnormal_vert,fragmentShader:ht.meshnormal_frag},sprite:{uniforms:Pn([Ne.sprite,Ne.fog]),vertexShader:ht.sprite_vert,fragmentShader:ht.sprite_frag},background:{uniforms:{uvTransform:{value:new ft},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:ht.background_vert,fragmentShader:ht.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new ft}},vertexShader:ht.backgroundCube_vert,fragmentShader:ht.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:ht.cube_vert,fragmentShader:ht.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:ht.equirect_vert,fragmentShader:ht.equirect_frag},distanceRGBA:{uniforms:Pn([Ne.common,Ne.displacementmap,{referencePosition:{value:new V},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:ht.distanceRGBA_vert,fragmentShader:ht.distanceRGBA_frag},shadow:{uniforms:Pn([Ne.lights,Ne.fog,{color:{value:new mt(0)},opacity:{value:1}}]),vertexShader:ht.shadow_vert,fragmentShader:ht.shadow_frag}};Pi.physical={uniforms:Pn([Pi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new ft},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new ft},clearcoatNormalScale:{value:new ut(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new ft},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new ft},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new ft},sheen:{value:0},sheenColor:{value:new mt(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new ft},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new ft},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new ft},transmissionSamplerSize:{value:new ut},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new ft},attenuationDistance:{value:0},attenuationColor:{value:new mt(0)},specularColor:{value:new mt(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new ft},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new ft},anisotropyVector:{value:new ut},anisotropyMap:{value:null},anisotropyMapTransform:{value:new ft}}]),vertexShader:ht.meshphysical_vert,fragmentShader:ht.meshphysical_frag};const Bl={r:0,b:0,g:0},ts=new Mi,BM=new Ft;function HM(s,e,t,r,a,l,u){const d=new mt(0);let h=l===!0?0:1,m,g,_=null,v=0,M=null;function T(L){let N=L.isScene===!0?L.background:null;return N&&N.isTexture&&(N=(L.backgroundBlurriness>0?t:e).get(N)),N}function b(L){let N=!1;const w=T(L);w===null?x(d,h):w&&w.isColor&&(x(w,1),N=!0);const O=s.xr.getEnvironmentBlendMode();O==="additive"?r.buffers.color.setClear(0,0,0,1,u):O==="alpha-blend"&&r.buffers.color.setClear(0,0,0,0,u),(s.autoClear||N)&&(r.buffers.depth.setTest(!0),r.buffers.depth.setMask(!0),r.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function y(L,N){const w=T(N);w&&(w.isCubeTexture||w.mapping===dc)?(g===void 0&&(g=new Fe(new Yt(1,1,1),new tr({name:"BackgroundCubeMaterial",uniforms:mo(Pi.backgroundCube.uniforms),vertexShader:Pi.backgroundCube.vertexShader,fragmentShader:Pi.backgroundCube.fragmentShader,side:Ln,depthTest:!1,depthWrite:!1,fog:!1})),g.geometry.deleteAttribute("normal"),g.geometry.deleteAttribute("uv"),g.onBeforeRender=function(O,D,F){this.matrixWorld.copyPosition(F.matrixWorld)},Object.defineProperty(g.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),a.update(g)),ts.copy(N.backgroundRotation),ts.x*=-1,ts.y*=-1,ts.z*=-1,w.isCubeTexture&&w.isRenderTargetTexture===!1&&(ts.y*=-1,ts.z*=-1),g.material.uniforms.envMap.value=w,g.material.uniforms.flipEnvMap.value=w.isCubeTexture&&w.isRenderTargetTexture===!1?-1:1,g.material.uniforms.backgroundBlurriness.value=N.backgroundBlurriness,g.material.uniforms.backgroundIntensity.value=N.backgroundIntensity,g.material.uniforms.backgroundRotation.value.setFromMatrix4(BM.makeRotationFromEuler(ts)),g.material.toneMapped=Tt.getTransfer(w.colorSpace)!==Lt,(_!==w||v!==w.version||M!==s.toneMapping)&&(g.material.needsUpdate=!0,_=w,v=w.version,M=s.toneMapping),g.layers.enableAll(),L.unshift(g,g.geometry,g.material,0,0,null)):w&&w.isTexture&&(m===void 0&&(m=new Fe(new ma(2,2),new tr({name:"BackgroundMaterial",uniforms:mo(Pi.background.uniforms),vertexShader:Pi.background.vertexShader,fragmentShader:Pi.background.fragmentShader,side:Ur,depthTest:!1,depthWrite:!1,fog:!1})),m.geometry.deleteAttribute("normal"),Object.defineProperty(m.material,"map",{get:function(){return this.uniforms.t2D.value}}),a.update(m)),m.material.uniforms.t2D.value=w,m.material.uniforms.backgroundIntensity.value=N.backgroundIntensity,m.material.toneMapped=Tt.getTransfer(w.colorSpace)!==Lt,w.matrixAutoUpdate===!0&&w.updateMatrix(),m.material.uniforms.uvTransform.value.copy(w.matrix),(_!==w||v!==w.version||M!==s.toneMapping)&&(m.material.needsUpdate=!0,_=w,v=w.version,M=s.toneMapping),m.layers.enableAll(),L.unshift(m,m.geometry,m.material,0,0,null))}function x(L,N){L.getRGB(Bl,rx(s)),r.buffers.color.setClear(Bl.r,Bl.g,Bl.b,N,u)}return{getClearColor:function(){return d},setClearColor:function(L,N=1){d.set(L),h=N,x(d,h)},getClearAlpha:function(){return h},setClearAlpha:function(L){h=L,x(d,h)},render:b,addToRenderList:y}}function VM(s,e){const t=s.getParameter(s.MAX_VERTEX_ATTRIBS),r={},a=v(null);let l=a,u=!1;function d(A,H,te,J,oe){let ce=!1;const j=_(J,te,H);l!==j&&(l=j,m(l.object)),ce=M(A,J,te,oe),ce&&T(A,J,te,oe),oe!==null&&e.update(oe,s.ELEMENT_ARRAY_BUFFER),(ce||u)&&(u=!1,w(A,H,te,J),oe!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,e.get(oe).buffer))}function h(){return s.createVertexArray()}function m(A){return s.bindVertexArray(A)}function g(A){return s.deleteVertexArray(A)}function _(A,H,te){const J=te.wireframe===!0;let oe=r[A.id];oe===void 0&&(oe={},r[A.id]=oe);let ce=oe[H.id];ce===void 0&&(ce={},oe[H.id]=ce);let j=ce[J];return j===void 0&&(j=v(h()),ce[J]=j),j}function v(A){const H=[],te=[],J=[];for(let oe=0;oe<t;oe++)H[oe]=0,te[oe]=0,J[oe]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:H,enabledAttributes:te,attributeDivisors:J,object:A,attributes:{},index:null}}function M(A,H,te,J){const oe=l.attributes,ce=H.attributes;let j=0;const Q=te.getAttributes();for(const z in Q)if(Q[z].location>=0){const q=oe[z];let I=ce[z];if(I===void 0&&(z==="instanceMatrix"&&A.instanceMatrix&&(I=A.instanceMatrix),z==="instanceColor"&&A.instanceColor&&(I=A.instanceColor)),q===void 0||q.attribute!==I||I&&q.data!==I.data)return!0;j++}return l.attributesNum!==j||l.index!==J}function T(A,H,te,J){const oe={},ce=H.attributes;let j=0;const Q=te.getAttributes();for(const z in Q)if(Q[z].location>=0){let q=ce[z];q===void 0&&(z==="instanceMatrix"&&A.instanceMatrix&&(q=A.instanceMatrix),z==="instanceColor"&&A.instanceColor&&(q=A.instanceColor));const I={};I.attribute=q,q&&q.data&&(I.data=q.data),oe[z]=I,j++}l.attributes=oe,l.attributesNum=j,l.index=J}function b(){const A=l.newAttributes;for(let H=0,te=A.length;H<te;H++)A[H]=0}function y(A){x(A,0)}function x(A,H){const te=l.newAttributes,J=l.enabledAttributes,oe=l.attributeDivisors;te[A]=1,J[A]===0&&(s.enableVertexAttribArray(A),J[A]=1),oe[A]!==H&&(s.vertexAttribDivisor(A,H),oe[A]=H)}function L(){const A=l.newAttributes,H=l.enabledAttributes;for(let te=0,J=H.length;te<J;te++)H[te]!==A[te]&&(s.disableVertexAttribArray(te),H[te]=0)}function N(A,H,te,J,oe,ce,j){j===!0?s.vertexAttribIPointer(A,H,te,oe,ce):s.vertexAttribPointer(A,H,te,J,oe,ce)}function w(A,H,te,J){b();const oe=J.attributes,ce=te.getAttributes(),j=H.defaultAttributeValues;for(const Q in ce){const z=ce[Q];if(z.location>=0){let X=oe[Q];if(X===void 0&&(Q==="instanceMatrix"&&A.instanceMatrix&&(X=A.instanceMatrix),Q==="instanceColor"&&A.instanceColor&&(X=A.instanceColor)),X!==void 0){const q=X.normalized,I=X.itemSize,ie=e.get(X);if(ie===void 0)continue;const be=ie.buffer,ne=ie.type,fe=ie.bytesPerElement,Se=ne===s.INT||ne===s.UNSIGNED_INT||X.gpuType===If;if(X.isInterleavedBufferAttribute){const xe=X.data,Ae=xe.stride,Ie=X.offset;if(xe.isInstancedInterleavedBuffer){for(let Ce=0;Ce<z.locationSize;Ce++)x(z.location+Ce,xe.meshPerAttribute);A.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=xe.meshPerAttribute*xe.count)}else for(let Ce=0;Ce<z.locationSize;Ce++)y(z.location+Ce);s.bindBuffer(s.ARRAY_BUFFER,be);for(let Ce=0;Ce<z.locationSize;Ce++)N(z.location+Ce,I/z.locationSize,ne,q,Ae*fe,(Ie+I/z.locationSize*Ce)*fe,Se)}else{if(X.isInstancedBufferAttribute){for(let xe=0;xe<z.locationSize;xe++)x(z.location+xe,X.meshPerAttribute);A.isInstancedMesh!==!0&&J._maxInstanceCount===void 0&&(J._maxInstanceCount=X.meshPerAttribute*X.count)}else for(let xe=0;xe<z.locationSize;xe++)y(z.location+xe);s.bindBuffer(s.ARRAY_BUFFER,be);for(let xe=0;xe<z.locationSize;xe++)N(z.location+xe,I/z.locationSize,ne,q,I*fe,I/z.locationSize*xe*fe,Se)}}else if(j!==void 0){const q=j[Q];if(q!==void 0)switch(q.length){case 2:s.vertexAttrib2fv(z.location,q);break;case 3:s.vertexAttrib3fv(z.location,q);break;case 4:s.vertexAttrib4fv(z.location,q);break;default:s.vertexAttrib1fv(z.location,q)}}}}L()}function O(){B();for(const A in r){const H=r[A];for(const te in H){const J=H[te];for(const oe in J)g(J[oe].object),delete J[oe];delete H[te]}delete r[A]}}function D(A){if(r[A.id]===void 0)return;const H=r[A.id];for(const te in H){const J=H[te];for(const oe in J)g(J[oe].object),delete J[oe];delete H[te]}delete r[A.id]}function F(A){for(const H in r){const te=r[H];if(te[A.id]===void 0)continue;const J=te[A.id];for(const oe in J)g(J[oe].object),delete J[oe];delete te[A.id]}}function B(){P(),u=!0,l!==a&&(l=a,m(l.object))}function P(){a.geometry=null,a.program=null,a.wireframe=!1}return{setup:d,reset:B,resetDefaultState:P,dispose:O,releaseStatesOfGeometry:D,releaseStatesOfProgram:F,initAttributes:b,enableAttribute:y,disableUnusedAttributes:L}}function GM(s,e,t){let r;function a(m){r=m}function l(m,g){s.drawArrays(r,m,g),t.update(g,r,1)}function u(m,g,_){_!==0&&(s.drawArraysInstanced(r,m,g,_),t.update(g,r,_))}function d(m,g,_){if(_===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(r,m,0,g,0,_);let M=0;for(let T=0;T<_;T++)M+=g[T];t.update(M,r,1)}function h(m,g,_,v){if(_===0)return;const M=e.get("WEBGL_multi_draw");if(M===null)for(let T=0;T<m.length;T++)u(m[T],g[T],v[T]);else{M.multiDrawArraysInstancedWEBGL(r,m,0,g,0,v,0,_);let T=0;for(let b=0;b<_;b++)T+=g[b]*v[b];t.update(T,r,1)}}this.setMode=a,this.render=l,this.renderInstances=u,this.renderMultiDraw=d,this.renderMultiDrawInstances=h}function jM(s,e,t,r){let a;function l(){if(a!==void 0)return a;if(e.has("EXT_texture_filter_anisotropic")===!0){const F=e.get("EXT_texture_filter_anisotropic");a=s.getParameter(F.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else a=0;return a}function u(F){return!(F!==_i&&r.convert(F)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function d(F){const B=F===ha&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(F!==er&&r.convert(F)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&F!==Ki&&!B)}function h(F){if(F==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";F="mediump"}return F==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let m=t.precision!==void 0?t.precision:"highp";const g=h(m);g!==m&&(console.warn("THREE.WebGLRenderer:",m,"not supported, using",g,"instead."),m=g);const _=t.logarithmicDepthBuffer===!0,v=t.reverseDepthBuffer===!0&&e.has("EXT_clip_control"),M=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),T=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),b=s.getParameter(s.MAX_TEXTURE_SIZE),y=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),x=s.getParameter(s.MAX_VERTEX_ATTRIBS),L=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),N=s.getParameter(s.MAX_VARYING_VECTORS),w=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),O=T>0,D=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:l,getMaxPrecision:h,textureFormatReadable:u,textureTypeReadable:d,precision:m,logarithmicDepthBuffer:_,reverseDepthBuffer:v,maxTextures:M,maxVertexTextures:T,maxTextureSize:b,maxCubemapSize:y,maxAttributes:x,maxVertexUniforms:L,maxVaryings:N,maxFragmentUniforms:w,vertexTextures:O,maxSamples:D}}function WM(s){const e=this;let t=null,r=0,a=!1,l=!1;const u=new rs,d=new ft,h={value:null,needsUpdate:!1};this.uniform=h,this.numPlanes=0,this.numIntersection=0,this.init=function(_,v){const M=_.length!==0||v||r!==0||a;return a=v,r=_.length,M},this.beginShadows=function(){l=!0,g(null)},this.endShadows=function(){l=!1},this.setGlobalState=function(_,v){t=g(_,v,0)},this.setState=function(_,v,M){const T=_.clippingPlanes,b=_.clipIntersection,y=_.clipShadows,x=s.get(_);if(!a||T===null||T.length===0||l&&!y)l?g(null):m();else{const L=l?0:r,N=L*4;let w=x.clippingState||null;h.value=w,w=g(T,v,N,M);for(let O=0;O!==N;++O)w[O]=t[O];x.clippingState=w,this.numIntersection=b?this.numPlanes:0,this.numPlanes+=L}};function m(){h.value!==t&&(h.value=t,h.needsUpdate=r>0),e.numPlanes=r,e.numIntersection=0}function g(_,v,M,T){const b=_!==null?_.length:0;let y=null;if(b!==0){if(y=h.value,T!==!0||y===null){const x=M+b*4,L=v.matrixWorldInverse;d.getNormalMatrix(L),(y===null||y.length<x)&&(y=new Float32Array(x));for(let N=0,w=M;N!==b;++N,w+=4)u.copy(_[N]).applyMatrix4(L,d),u.normal.toArray(y,w),y[w+3]=u.constant}h.value=y,h.needsUpdate=!0}return e.numPlanes=b,e.numIntersection=0,y}}function XM(s){let e=new WeakMap;function t(u,d){return d===qd?u.mapping=uo:d===Zd&&(u.mapping=fo),u}function r(u){if(u&&u.isTexture){const d=u.mapping;if(d===qd||d===Zd)if(e.has(u)){const h=e.get(u).texture;return t(h,u.mapping)}else{const h=u.image;if(h&&h.height>0){const m=new iS(h.height);return m.fromEquirectangularTexture(s,u),e.set(u,m),u.addEventListener("dispose",a),t(m.texture,u.mapping)}else return null}}return u}function a(u){const d=u.target;d.removeEventListener("dispose",a);const h=e.get(d);h!==void 0&&(e.delete(d),h.dispose())}function l(){e=new WeakMap}return{get:r,dispose:l}}class lx extends sx{constructor(e=-1,t=1,r=1,a=-1,l=.1,u=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=r,this.bottom=a,this.near=l,this.far=u,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,r,a,l,u){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=r,this.view.offsetY=a,this.view.width=l,this.view.height=u,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){const e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),r=(this.right+this.left)/2,a=(this.top+this.bottom)/2;let l=r-e,u=r+e,d=a+t,h=a-t;if(this.view!==null&&this.view.enabled){const m=(this.right-this.left)/this.view.fullWidth/this.zoom,g=(this.top-this.bottom)/this.view.fullHeight/this.zoom;l+=m*this.view.offsetX,u=l+m*this.view.width,d-=g*this.view.offsetY,h=d-g*this.view.height}this.projectionMatrix.makeOrthographic(l,u,d,h,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){const t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}}const ro=4,Ym=[.125,.215,.35,.446,.526,.582],ls=20,wd=new lx,qm=new mt;let Td=null,bd=0,Ad=0,Cd=!1;const ss=(1+Math.sqrt(5))/2,Qs=1/ss,Zm=[new V(-ss,Qs,0),new V(ss,Qs,0),new V(-Qs,0,ss),new V(Qs,0,ss),new V(0,ss,-Qs),new V(0,ss,Qs),new V(-1,1,-1),new V(1,1,-1),new V(-1,1,1),new V(1,1,1)];class Km{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,r=.1,a=100){Td=this._renderer.getRenderTarget(),bd=this._renderer.getActiveCubeFace(),Ad=this._renderer.getActiveMipmapLevel(),Cd=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(256);const l=this._allocateTargets();return l.depthBuffer=!0,this._sceneToCubeUV(e,r,a,l),t>0&&this._blur(l,0,0,t),this._applyPMREM(l),this._cleanup(l),l}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=e0(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Jm(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(Td,bd,Ad),this._renderer.xr.enabled=Cd,e.scissorTest=!1,Hl(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===uo||e.mapping===fo?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),Td=this._renderer.getRenderTarget(),bd=this._renderer.getActiveCubeFace(),Ad=this._renderer.getActiveMipmapLevel(),Cd=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const r=t||this._allocateTargets();return this._textureToCubeUV(e,r),this._applyPMREM(r),this._cleanup(r),r}_allocateTargets(){const e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,r={magFilter:vi,minFilter:vi,generateMipmaps:!1,type:ha,format:_i,colorSpace:go,depthBuffer:!1},a=Qm(e,t,r);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Qm(e,t,r);const{_lodMax:l}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=$M(l)),this._blurMaterial=YM(l,e,t)}return a}_compileMaterial(e){const t=new Fe(this._lodPlanes[0],e);this._renderer.compile(t,wd)}_sceneToCubeUV(e,t,r,a){const d=new si(90,1,t,r),h=[1,-1,1,1,1,1],m=[1,1,1,-1,-1,-1],g=this._renderer,_=g.autoClear,v=g.toneMapping;g.getClearColor(qm),g.toneMapping=Dr,g.autoClear=!1;const M=new pc({name:"PMREM.Background",side:Ln,depthWrite:!1,depthTest:!1}),T=new Fe(new Yt,M);let b=!1;const y=e.background;y?y.isColor&&(M.color.copy(y),e.background=null,b=!0):(M.color.copy(qm),b=!0);for(let x=0;x<6;x++){const L=x%3;L===0?(d.up.set(0,h[x],0),d.lookAt(m[x],0,0)):L===1?(d.up.set(0,0,h[x]),d.lookAt(0,m[x],0)):(d.up.set(0,h[x],0),d.lookAt(0,0,m[x]));const N=this._cubeSize;Hl(a,L*N,x>2?N:0,N,N),g.setRenderTarget(a),b&&g.render(T,d),g.render(e,d)}T.geometry.dispose(),T.material.dispose(),g.toneMapping=v,g.autoClear=_,e.background=y}_textureToCubeUV(e,t){const r=this._renderer,a=e.mapping===uo||e.mapping===fo;a?(this._cubemapMaterial===null&&(this._cubemapMaterial=e0()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Jm());const l=a?this._cubemapMaterial:this._equirectMaterial,u=new Fe(this._lodPlanes[0],l),d=l.uniforms;d.envMap.value=e;const h=this._cubeSize;Hl(t,0,0,3*h,2*h),r.setRenderTarget(t),r.render(u,wd)}_applyPMREM(e){const t=this._renderer,r=t.autoClear;t.autoClear=!1;const a=this._lodPlanes.length;for(let l=1;l<a;l++){const u=Math.sqrt(this._sigmas[l]*this._sigmas[l]-this._sigmas[l-1]*this._sigmas[l-1]),d=Zm[(a-l-1)%Zm.length];this._blur(e,l-1,l,u,d)}t.autoClear=r}_blur(e,t,r,a,l){const u=this._pingPongRenderTarget;this._halfBlur(e,u,t,r,a,"latitudinal",l),this._halfBlur(u,e,r,r,a,"longitudinal",l)}_halfBlur(e,t,r,a,l,u,d){const h=this._renderer,m=this._blurMaterial;u!=="latitudinal"&&u!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");const g=3,_=new Fe(this._lodPlanes[a],m),v=m.uniforms,M=this._sizeLods[r]-1,T=isFinite(l)?Math.PI/(2*M):2*Math.PI/(2*ls-1),b=l/T,y=isFinite(l)?1+Math.floor(g*b):ls;y>ls&&console.warn(`sigmaRadians, ${l}, is too large and will clip, as it requested ${y} samples when the maximum is set to ${ls}`);const x=[];let L=0;for(let F=0;F<ls;++F){const B=F/b,P=Math.exp(-B*B/2);x.push(P),F===0?L+=P:F<y&&(L+=2*P)}for(let F=0;F<x.length;F++)x[F]=x[F]/L;v.envMap.value=e.texture,v.samples.value=y,v.weights.value=x,v.latitudinal.value=u==="latitudinal",d&&(v.poleAxis.value=d);const{_lodMax:N}=this;v.dTheta.value=T,v.mipInt.value=N-r;const w=this._sizeLods[a],O=3*w*(a>N-ro?a-N+ro:0),D=4*(this._cubeSize-w);Hl(t,O,D,3*w,2*w),h.setRenderTarget(t),h.render(_,wd)}}function $M(s){const e=[],t=[],r=[];let a=s;const l=s-ro+1+Ym.length;for(let u=0;u<l;u++){const d=Math.pow(2,a);t.push(d);let h=1/d;u>s-ro?h=Ym[u-s+ro-1]:u===0&&(h=0),r.push(h);const m=1/(d-2),g=-m,_=1+m,v=[g,g,_,g,_,_,g,g,_,_,g,_],M=6,T=6,b=3,y=2,x=1,L=new Float32Array(b*T*M),N=new Float32Array(y*T*M),w=new Float32Array(x*T*M);for(let D=0;D<M;D++){const F=D%3*2/3-1,B=D>2?0:-1,P=[F,B,0,F+2/3,B,0,F+2/3,B+1,0,F,B,0,F+2/3,B+1,0,F,B+1,0];L.set(P,b*T*D),N.set(v,y*T*D);const A=[D,D,D,D,D,D];w.set(A,x*T*D)}const O=new Xt;O.setAttribute("position",new Si(L,b)),O.setAttribute("uv",new Si(N,y)),O.setAttribute("faceIndex",new Si(w,x)),e.push(O),a>ro&&a--}return{lodPlanes:e,sizeLods:t,sigmas:r}}function Qm(s,e,t){const r=new fs(s,e,t);return r.texture.mapping=dc,r.texture.name="PMREM.cubeUv",r.scissorTest=!0,r}function Hl(s,e,t,r,a){s.viewport.set(e,t,r,a),s.scissor.set(e,t,r,a)}function YM(s,e,t){const r=new Float32Array(ls),a=new V(0,1,0);return new tr({name:"SphericalGaussianBlur",defines:{n:ls,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:r},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:a}},vertexShader:Gf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Lr,depthTest:!1,depthWrite:!1})}function Jm(){return new tr({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:Gf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Lr,depthTest:!1,depthWrite:!1})}function e0(){return new tr({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:Gf(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Lr,depthTest:!1,depthWrite:!1})}function Gf(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function qM(s){let e=new WeakMap,t=null;function r(d){if(d&&d.isTexture){const h=d.mapping,m=h===qd||h===Zd,g=h===uo||h===fo;if(m||g){let _=e.get(d);const v=_!==void 0?_.texture.pmremVersion:0;if(d.isRenderTargetTexture&&d.pmremVersion!==v)return t===null&&(t=new Km(s)),_=m?t.fromEquirectangular(d,_):t.fromCubemap(d,_),_.texture.pmremVersion=d.pmremVersion,e.set(d,_),_.texture;if(_!==void 0)return _.texture;{const M=d.image;return m&&M&&M.height>0||g&&M&&a(M)?(t===null&&(t=new Km(s)),_=m?t.fromEquirectangular(d):t.fromCubemap(d),_.texture.pmremVersion=d.pmremVersion,e.set(d,_),d.addEventListener("dispose",l),_.texture):null}}}return d}function a(d){let h=0;const m=6;for(let g=0;g<m;g++)d[g]!==void 0&&h++;return h===m}function l(d){const h=d.target;h.removeEventListener("dispose",l);const m=e.get(h);m!==void 0&&(e.delete(h),m.dispose())}function u(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:r,dispose:u}}function ZM(s){const e={};function t(r){if(e[r]!==void 0)return e[r];let a;switch(r){case"WEBGL_depth_texture":a=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":a=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":a=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":a=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:a=s.getExtension(r)}return e[r]=a,a}return{has:function(r){return t(r)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(r){const a=t(r);return a===null&&oa("THREE.WebGLRenderer: "+r+" extension not supported."),a}}}function KM(s,e,t,r){const a={},l=new WeakMap;function u(_){const v=_.target;v.index!==null&&e.remove(v.index);for(const T in v.attributes)e.remove(v.attributes[T]);for(const T in v.morphAttributes){const b=v.morphAttributes[T];for(let y=0,x=b.length;y<x;y++)e.remove(b[y])}v.removeEventListener("dispose",u),delete a[v.id];const M=l.get(v);M&&(e.remove(M),l.delete(v)),r.releaseStatesOfGeometry(v),v.isInstancedBufferGeometry===!0&&delete v._maxInstanceCount,t.memory.geometries--}function d(_,v){return a[v.id]===!0||(v.addEventListener("dispose",u),a[v.id]=!0,t.memory.geometries++),v}function h(_){const v=_.attributes;for(const T in v)e.update(v[T],s.ARRAY_BUFFER);const M=_.morphAttributes;for(const T in M){const b=M[T];for(let y=0,x=b.length;y<x;y++)e.update(b[y],s.ARRAY_BUFFER)}}function m(_){const v=[],M=_.index,T=_.attributes.position;let b=0;if(M!==null){const L=M.array;b=M.version;for(let N=0,w=L.length;N<w;N+=3){const O=L[N+0],D=L[N+1],F=L[N+2];v.push(O,D,D,F,F,O)}}else if(T!==void 0){const L=T.array;b=T.version;for(let N=0,w=L.length/3-1;N<w;N+=3){const O=N+0,D=N+1,F=N+2;v.push(O,D,D,F,F,O)}}else return;const y=new(Qg(v)?ix:nx)(v,1);y.version=b;const x=l.get(_);x&&e.remove(x),l.set(_,y)}function g(_){const v=l.get(_);if(v){const M=_.index;M!==null&&v.version<M.version&&m(_)}else m(_);return l.get(_)}return{get:d,update:h,getWireframeAttribute:g}}function QM(s,e,t){let r;function a(v){r=v}let l,u;function d(v){l=v.type,u=v.bytesPerElement}function h(v,M){s.drawElements(r,M,l,v*u),t.update(M,r,1)}function m(v,M,T){T!==0&&(s.drawElementsInstanced(r,M,l,v*u,T),t.update(M,r,T))}function g(v,M,T){if(T===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(r,M,0,l,v,0,T);let y=0;for(let x=0;x<T;x++)y+=M[x];t.update(y,r,1)}function _(v,M,T,b){if(T===0)return;const y=e.get("WEBGL_multi_draw");if(y===null)for(let x=0;x<v.length;x++)m(v[x]/u,M[x],b[x]);else{y.multiDrawElementsInstancedWEBGL(r,M,0,l,v,0,b,0,T);let x=0;for(let L=0;L<T;L++)x+=M[L]*b[L];t.update(x,r,1)}}this.setMode=a,this.setIndex=d,this.render=h,this.renderInstances=m,this.renderMultiDraw=g,this.renderMultiDrawInstances=_}function JM(s){const e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function r(l,u,d){switch(t.calls++,u){case s.TRIANGLES:t.triangles+=d*(l/3);break;case s.LINES:t.lines+=d*(l/2);break;case s.LINE_STRIP:t.lines+=d*(l-1);break;case s.LINE_LOOP:t.lines+=d*l;break;case s.POINTS:t.points+=d*l;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",u);break}}function a(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:a,update:r}}function eE(s,e,t){const r=new WeakMap,a=new qt;function l(u,d,h){const m=u.morphTargetInfluences,g=d.morphAttributes.position||d.morphAttributes.normal||d.morphAttributes.color,_=g!==void 0?g.length:0;let v=r.get(d);if(v===void 0||v.count!==_){let A=function(){B.dispose(),r.delete(d),d.removeEventListener("dispose",A)};var M=A;v!==void 0&&v.texture.dispose();const T=d.morphAttributes.position!==void 0,b=d.morphAttributes.normal!==void 0,y=d.morphAttributes.color!==void 0,x=d.morphAttributes.position||[],L=d.morphAttributes.normal||[],N=d.morphAttributes.color||[];let w=0;T===!0&&(w=1),b===!0&&(w=2),y===!0&&(w=3);let O=d.attributes.position.count*w,D=1;O>e.maxTextureSize&&(D=Math.ceil(O/e.maxTextureSize),O=e.maxTextureSize);const F=new Float32Array(O*D*4*_),B=new ex(F,O,D,_);B.type=Ki,B.needsUpdate=!0;const P=w*4;for(let H=0;H<_;H++){const te=x[H],J=L[H],oe=N[H],ce=O*D*4*H;for(let j=0;j<te.count;j++){const Q=j*P;T===!0&&(a.fromBufferAttribute(te,j),F[ce+Q+0]=a.x,F[ce+Q+1]=a.y,F[ce+Q+2]=a.z,F[ce+Q+3]=0),b===!0&&(a.fromBufferAttribute(J,j),F[ce+Q+4]=a.x,F[ce+Q+5]=a.y,F[ce+Q+6]=a.z,F[ce+Q+7]=0),y===!0&&(a.fromBufferAttribute(oe,j),F[ce+Q+8]=a.x,F[ce+Q+9]=a.y,F[ce+Q+10]=a.z,F[ce+Q+11]=oe.itemSize===4?a.w:1)}}v={count:_,texture:B,size:new ut(O,D)},r.set(d,v),d.addEventListener("dispose",A)}if(u.isInstancedMesh===!0&&u.morphTexture!==null)h.getUniforms().setValue(s,"morphTexture",u.morphTexture,t);else{let T=0;for(let y=0;y<m.length;y++)T+=m[y];const b=d.morphTargetsRelative?1:1-T;h.getUniforms().setValue(s,"morphTargetBaseInfluence",b),h.getUniforms().setValue(s,"morphTargetInfluences",m)}h.getUniforms().setValue(s,"morphTargetsTexture",v.texture,t),h.getUniforms().setValue(s,"morphTargetsTextureSize",v.size)}return{update:l}}function tE(s,e,t,r){let a=new WeakMap;function l(h){const m=r.render.frame,g=h.geometry,_=e.get(h,g);if(a.get(_)!==m&&(e.update(_),a.set(_,m)),h.isInstancedMesh&&(h.hasEventListener("dispose",d)===!1&&h.addEventListener("dispose",d),a.get(h)!==m&&(t.update(h.instanceMatrix,s.ARRAY_BUFFER),h.instanceColor!==null&&t.update(h.instanceColor,s.ARRAY_BUFFER),a.set(h,m))),h.isSkinnedMesh){const v=h.skeleton;a.get(v)!==m&&(v.update(),a.set(v,m))}return _}function u(){a=new WeakMap}function d(h){const m=h.target;m.removeEventListener("dispose",d),t.remove(m.instanceMatrix),m.instanceColor!==null&&t.remove(m.instanceColor)}return{update:l,dispose:u}}class cx extends Dn{constructor(e,t,r,a,l,u,d,h,m,g=ao){if(g!==ao&&g!==po)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");r===void 0&&g===ao&&(r=ds),r===void 0&&g===po&&(r=ho),super(null,a,l,u,d,h,g,r,m),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=d!==void 0?d:yi,this.minFilter=h!==void 0?h:yi,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.compareFunction=e.compareFunction,this}toJSON(e){const t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}}const ux=new Dn,t0=new cx(1,1),dx=new ex,fx=new Hy,hx=new ox,n0=[],i0=[],r0=new Float32Array(16),s0=new Float32Array(9),o0=new Float32Array(4);function xo(s,e,t){const r=s[0];if(r<=0||r>0)return s;const a=e*t;let l=n0[a];if(l===void 0&&(l=new Float32Array(a),n0[a]=l),e!==0){r.toArray(l,0);for(let u=1,d=0;u!==e;++u)d+=t,s[u].toArray(l,d)}return l}function sn(s,e){if(s.length!==e.length)return!1;for(let t=0,r=s.length;t<r;t++)if(s[t]!==e[t])return!1;return!0}function on(s,e){for(let t=0,r=e.length;t<r;t++)s[t]=e[t]}function mc(s,e){let t=i0[e];t===void 0&&(t=new Int32Array(e),i0[e]=t);for(let r=0;r!==e;++r)t[r]=s.allocateTextureUnit();return t}function nE(s,e){const t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function iE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(sn(t,e))return;s.uniform2fv(this.addr,e),on(t,e)}}function rE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(sn(t,e))return;s.uniform3fv(this.addr,e),on(t,e)}}function sE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(sn(t,e))return;s.uniform4fv(this.addr,e),on(t,e)}}function oE(s,e){const t=this.cache,r=e.elements;if(r===void 0){if(sn(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),on(t,e)}else{if(sn(t,r))return;o0.set(r),s.uniformMatrix2fv(this.addr,!1,o0),on(t,r)}}function aE(s,e){const t=this.cache,r=e.elements;if(r===void 0){if(sn(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),on(t,e)}else{if(sn(t,r))return;s0.set(r),s.uniformMatrix3fv(this.addr,!1,s0),on(t,r)}}function lE(s,e){const t=this.cache,r=e.elements;if(r===void 0){if(sn(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),on(t,e)}else{if(sn(t,r))return;r0.set(r),s.uniformMatrix4fv(this.addr,!1,r0),on(t,r)}}function cE(s,e){const t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function uE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(sn(t,e))return;s.uniform2iv(this.addr,e),on(t,e)}}function dE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(sn(t,e))return;s.uniform3iv(this.addr,e),on(t,e)}}function fE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(sn(t,e))return;s.uniform4iv(this.addr,e),on(t,e)}}function hE(s,e){const t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function pE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(sn(t,e))return;s.uniform2uiv(this.addr,e),on(t,e)}}function mE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(sn(t,e))return;s.uniform3uiv(this.addr,e),on(t,e)}}function gE(s,e){const t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(sn(t,e))return;s.uniform4uiv(this.addr,e),on(t,e)}}function xE(s,e,t){const r=this.cache,a=t.allocateTextureUnit();r[0]!==a&&(s.uniform1i(this.addr,a),r[0]=a);let l;this.type===s.SAMPLER_2D_SHADOW?(t0.compareFunction=Kg,l=t0):l=ux,t.setTexture2D(e||l,a)}function vE(s,e,t){const r=this.cache,a=t.allocateTextureUnit();r[0]!==a&&(s.uniform1i(this.addr,a),r[0]=a),t.setTexture3D(e||fx,a)}function _E(s,e,t){const r=this.cache,a=t.allocateTextureUnit();r[0]!==a&&(s.uniform1i(this.addr,a),r[0]=a),t.setTextureCube(e||hx,a)}function yE(s,e,t){const r=this.cache,a=t.allocateTextureUnit();r[0]!==a&&(s.uniform1i(this.addr,a),r[0]=a),t.setTexture2DArray(e||dx,a)}function SE(s){switch(s){case 5126:return nE;case 35664:return iE;case 35665:return rE;case 35666:return sE;case 35674:return oE;case 35675:return aE;case 35676:return lE;case 5124:case 35670:return cE;case 35667:case 35671:return uE;case 35668:case 35672:return dE;case 35669:case 35673:return fE;case 5125:return hE;case 36294:return pE;case 36295:return mE;case 36296:return gE;case 35678:case 36198:case 36298:case 36306:case 35682:return xE;case 35679:case 36299:case 36307:return vE;case 35680:case 36300:case 36308:case 36293:return _E;case 36289:case 36303:case 36311:case 36292:return yE}}function ME(s,e){s.uniform1fv(this.addr,e)}function EE(s,e){const t=xo(e,this.size,2);s.uniform2fv(this.addr,t)}function wE(s,e){const t=xo(e,this.size,3);s.uniform3fv(this.addr,t)}function TE(s,e){const t=xo(e,this.size,4);s.uniform4fv(this.addr,t)}function bE(s,e){const t=xo(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function AE(s,e){const t=xo(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function CE(s,e){const t=xo(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function RE(s,e){s.uniform1iv(this.addr,e)}function PE(s,e){s.uniform2iv(this.addr,e)}function NE(s,e){s.uniform3iv(this.addr,e)}function LE(s,e){s.uniform4iv(this.addr,e)}function DE(s,e){s.uniform1uiv(this.addr,e)}function IE(s,e){s.uniform2uiv(this.addr,e)}function UE(s,e){s.uniform3uiv(this.addr,e)}function FE(s,e){s.uniform4uiv(this.addr,e)}function kE(s,e,t){const r=this.cache,a=e.length,l=mc(t,a);sn(r,l)||(s.uniform1iv(this.addr,l),on(r,l));for(let u=0;u!==a;++u)t.setTexture2D(e[u]||ux,l[u])}function OE(s,e,t){const r=this.cache,a=e.length,l=mc(t,a);sn(r,l)||(s.uniform1iv(this.addr,l),on(r,l));for(let u=0;u!==a;++u)t.setTexture3D(e[u]||fx,l[u])}function zE(s,e,t){const r=this.cache,a=e.length,l=mc(t,a);sn(r,l)||(s.uniform1iv(this.addr,l),on(r,l));for(let u=0;u!==a;++u)t.setTextureCube(e[u]||hx,l[u])}function BE(s,e,t){const r=this.cache,a=e.length,l=mc(t,a);sn(r,l)||(s.uniform1iv(this.addr,l),on(r,l));for(let u=0;u!==a;++u)t.setTexture2DArray(e[u]||dx,l[u])}function HE(s){switch(s){case 5126:return ME;case 35664:return EE;case 35665:return wE;case 35666:return TE;case 35674:return bE;case 35675:return AE;case 35676:return CE;case 5124:case 35670:return RE;case 35667:case 35671:return PE;case 35668:case 35672:return NE;case 35669:case 35673:return LE;case 5125:return DE;case 36294:return IE;case 36295:return UE;case 36296:return FE;case 35678:case 36198:case 36298:case 36306:case 35682:return kE;case 35679:case 36299:case 36307:return OE;case 35680:case 36300:case 36308:case 36293:return zE;case 36289:case 36303:case 36311:case 36292:return BE}}class VE{constructor(e,t,r){this.id=e,this.addr=r,this.cache=[],this.type=t.type,this.setValue=SE(t.type)}}class GE{constructor(e,t,r){this.id=e,this.addr=r,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=HE(t.type)}}class jE{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,r){const a=this.seq;for(let l=0,u=a.length;l!==u;++l){const d=a[l];d.setValue(e,t[d.id],r)}}}const Rd=/(\w+)(\])?(\[|\.)?/g;function a0(s,e){s.seq.push(e),s.map[e.id]=e}function WE(s,e,t){const r=s.name,a=r.length;for(Rd.lastIndex=0;;){const l=Rd.exec(r),u=Rd.lastIndex;let d=l[1];const h=l[2]==="]",m=l[3];if(h&&(d=d|0),m===void 0||m==="["&&u+2===a){a0(t,m===void 0?new VE(d,s,e):new GE(d,s,e));break}else{let _=t.map[d];_===void 0&&(_=new jE(d),a0(t,_)),t=_}}}class nc{constructor(e,t){this.seq=[],this.map={};const r=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let a=0;a<r;++a){const l=e.getActiveUniform(t,a),u=e.getUniformLocation(t,l.name);WE(l,u,this)}}setValue(e,t,r,a){const l=this.map[t];l!==void 0&&l.setValue(e,r,a)}setOptional(e,t,r){const a=t[r];a!==void 0&&this.setValue(e,r,a)}static upload(e,t,r,a){for(let l=0,u=t.length;l!==u;++l){const d=t[l],h=r[d.id];h.needsUpdate!==!1&&d.setValue(e,h.value,a)}}static seqWithValue(e,t){const r=[];for(let a=0,l=e.length;a!==l;++a){const u=e[a];u.id in t&&r.push(u)}return r}}function l0(s,e,t){const r=s.createShader(e);return s.shaderSource(r,t),s.compileShader(r),r}const XE=37297;let $E=0;function YE(s,e){const t=s.split(`
`),r=[],a=Math.max(e-6,0),l=Math.min(e+6,t.length);for(let u=a;u<l;u++){const d=u+1;r.push(`${d===e?">":" "} ${d}: ${t[u]}`)}return r.join(`
`)}const c0=new ft;function qE(s){Tt._getMatrix(c0,Tt.workingColorSpace,s);const e=`mat3( ${c0.elements.map(t=>t.toFixed(4))} )`;switch(Tt.getTransfer(s)){case fc:return[e,"LinearTransferOETF"];case Lt:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",s),[e,"LinearTransferOETF"]}}function u0(s,e,t){const r=s.getShaderParameter(e,s.COMPILE_STATUS),a=s.getShaderInfoLog(e).trim();if(r&&a==="")return"";const l=/ERROR: 0:(\d+)/.exec(a);if(l){const u=parseInt(l[1]);return t.toUpperCase()+`

`+a+`

`+YE(s.getShaderSource(e),u)}else return a}function ZE(s,e){const t=qE(e);return[`vec4 ${s}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function KE(s,e){let t;switch(e){case my:t="Linear";break;case gy:t="Reinhard";break;case xy:t="Cineon";break;case Og:t="ACESFilmic";break;case _y:t="AgX";break;case yy:t="Neutral";break;case vy:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const Vl=new V;function QE(){Tt.getLuminanceCoefficients(Vl);const s=Vl.x.toFixed(4),e=Vl.y.toFixed(4),t=Vl.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function JE(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(aa).join(`
`)}function ew(s){const e=[];for(const t in s){const r=s[t];r!==!1&&e.push("#define "+t+" "+r)}return e.join(`
`)}function tw(s,e){const t={},r=s.getProgramParameter(e,s.ACTIVE_ATTRIBUTES);for(let a=0;a<r;a++){const l=s.getActiveAttrib(e,a),u=l.name;let d=1;l.type===s.FLOAT_MAT2&&(d=2),l.type===s.FLOAT_MAT3&&(d=3),l.type===s.FLOAT_MAT4&&(d=4),t[u]={type:l.type,location:s.getAttribLocation(e,u),locationSize:d}}return t}function aa(s){return s!==""}function d0(s,e){const t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function f0(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}const nw=/^[ \t]*#include +<([\w\d./]+)>/gm;function Cf(s){return s.replace(nw,rw)}const iw=new Map;function rw(s,e){let t=ht[e];if(t===void 0){const r=iw.get(e);if(r!==void 0)t=ht[r],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,r);else throw new Error("Can not resolve #include <"+e+">")}return Cf(t)}const sw=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function h0(s){return s.replace(sw,ow)}function ow(s,e,t,r){let a="";for(let l=parseInt(e);l<parseInt(t);l++)a+=r.replace(/\[\s*i\s*\]/g,"[ "+l+" ]").replace(/UNROLLED_LOOP_INDEX/g,l);return a}function p0(s){let e=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?e+=`
#define HIGH_PRECISION`:s.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function aw(s){let e="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===Ug?e="SHADOWMAP_TYPE_PCF":s.shadowMapType===Fg?e="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===qi&&(e="SHADOWMAP_TYPE_VSM"),e}function lw(s){let e="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case uo:case fo:e="ENVMAP_TYPE_CUBE";break;case dc:e="ENVMAP_TYPE_CUBE_UV";break}return e}function cw(s){let e="ENVMAP_MODE_REFLECTION";if(s.envMap)switch(s.envMapMode){case fo:e="ENVMAP_MODE_REFRACTION";break}return e}function uw(s){let e="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case kg:e="ENVMAP_BLENDING_MULTIPLY";break;case hy:e="ENVMAP_BLENDING_MIX";break;case py:e="ENVMAP_BLENDING_ADD";break}return e}function dw(s){const e=s.envMapCubeUVHeight;if(e===null)return null;const t=Math.log2(e)-2,r=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:r,maxMip:t}}function fw(s,e,t,r){const a=s.getContext(),l=t.defines;let u=t.vertexShader,d=t.fragmentShader;const h=aw(t),m=lw(t),g=cw(t),_=uw(t),v=dw(t),M=JE(t),T=ew(l),b=a.createProgram();let y,x,L=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(y=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,T].filter(aa).join(`
`),y.length>0&&(y+=`
`),x=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,T].filter(aa).join(`
`),x.length>0&&(x+=`
`)):(y=[p0(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,T,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+g:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+h:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(aa).join(`
`),x=[p0(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,T,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+m:"",t.envMap?"#define "+g:"",t.envMap?"#define "+_:"",v?"#define CUBEUV_TEXEL_WIDTH "+v.texelWidth:"",v?"#define CUBEUV_TEXEL_HEIGHT "+v.texelHeight:"",v?"#define CUBEUV_MAX_MIP "+v.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+h:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Dr?"#define TONE_MAPPING":"",t.toneMapping!==Dr?ht.tonemapping_pars_fragment:"",t.toneMapping!==Dr?KE("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",ht.colorspace_pars_fragment,ZE("linearToOutputTexel",t.outputColorSpace),QE(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(aa).join(`
`)),u=Cf(u),u=d0(u,t),u=f0(u,t),d=Cf(d),d=d0(d,t),d=f0(d,t),u=h0(u),d=h0(d),t.isRawShaderMaterial!==!0&&(L=`#version 300 es
`,y=[M,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+y,x=["#define varying in",t.glslVersion===Am?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Am?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+x);const N=L+y+u,w=L+x+d,O=l0(a,a.VERTEX_SHADER,N),D=l0(a,a.FRAGMENT_SHADER,w);a.attachShader(b,O),a.attachShader(b,D),t.index0AttributeName!==void 0?a.bindAttribLocation(b,0,t.index0AttributeName):t.morphTargets===!0&&a.bindAttribLocation(b,0,"position"),a.linkProgram(b);function F(H){if(s.debug.checkShaderErrors){const te=a.getProgramInfoLog(b).trim(),J=a.getShaderInfoLog(O).trim(),oe=a.getShaderInfoLog(D).trim();let ce=!0,j=!0;if(a.getProgramParameter(b,a.LINK_STATUS)===!1)if(ce=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(a,b,O,D);else{const Q=u0(a,O,"vertex"),z=u0(a,D,"fragment");console.error("THREE.WebGLProgram: Shader Error "+a.getError()+" - VALIDATE_STATUS "+a.getProgramParameter(b,a.VALIDATE_STATUS)+`

Material Name: `+H.name+`
Material Type: `+H.type+`

Program Info Log: `+te+`
`+Q+`
`+z)}else te!==""?console.warn("THREE.WebGLProgram: Program Info Log:",te):(J===""||oe==="")&&(j=!1);j&&(H.diagnostics={runnable:ce,programLog:te,vertexShader:{log:J,prefix:y},fragmentShader:{log:oe,prefix:x}})}a.deleteShader(O),a.deleteShader(D),B=new nc(a,b),P=tw(a,b)}let B;this.getUniforms=function(){return B===void 0&&F(this),B};let P;this.getAttributes=function(){return P===void 0&&F(this),P};let A=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return A===!1&&(A=a.getProgramParameter(b,XE)),A},this.destroy=function(){r.releaseStatesOfProgram(this),a.deleteProgram(b),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=$E++,this.cacheKey=e,this.usedTimes=1,this.program=b,this.vertexShader=O,this.fragmentShader=D,this}let hw=0;class pw{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){const t=e.vertexShader,r=e.fragmentShader,a=this._getShaderStage(t),l=this._getShaderStage(r),u=this._getShaderCacheForMaterial(e);return u.has(a)===!1&&(u.add(a),a.usedTimes++),u.has(l)===!1&&(u.add(l),l.usedTimes++),this}remove(e){const t=this.materialCache.get(e);for(const r of t)r.usedTimes--,r.usedTimes===0&&this.shaderCache.delete(r.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){const t=this.materialCache;let r=t.get(e);return r===void 0&&(r=new Set,t.set(e,r)),r}_getShaderStage(e){const t=this.shaderCache;let r=t.get(e);return r===void 0&&(r=new mw(e),t.set(e,r)),r}}class mw{constructor(e){this.id=hw++,this.code=e,this.usedTimes=0}}function gw(s,e,t,r,a,l,u){const d=new Hf,h=new pw,m=new Set,g=[],_=a.logarithmicDepthBuffer,v=a.vertexTextures;let M=a.precision;const T={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function b(P){return m.add(P),P===0?"uv":`uv${P}`}function y(P,A,H,te,J){const oe=te.fog,ce=J.geometry,j=P.isMeshStandardMaterial?te.environment:null,Q=(P.isMeshStandardMaterial?t:e).get(P.envMap||j),z=Q&&Q.mapping===dc?Q.image.height:null,X=T[P.type];P.precision!==null&&(M=a.getMaxPrecision(P.precision),M!==P.precision&&console.warn("THREE.WebGLProgram.getParameters:",P.precision,"not supported, using",M,"instead."));const q=ce.morphAttributes.position||ce.morphAttributes.normal||ce.morphAttributes.color,I=q!==void 0?q.length:0;let ie=0;ce.morphAttributes.position!==void 0&&(ie=1),ce.morphAttributes.normal!==void 0&&(ie=2),ce.morphAttributes.color!==void 0&&(ie=3);let be,ne,fe,Se;if(X){const Et=Pi[X];be=Et.vertexShader,ne=Et.fragmentShader}else be=P.vertexShader,ne=P.fragmentShader,h.update(P),fe=h.getVertexShaderID(P),Se=h.getFragmentShaderID(P);const xe=s.getRenderTarget(),Ae=s.state.buffers.depth.getReversed(),Ie=J.isInstancedMesh===!0,Ce=J.isBatchedMesh===!0,Ze=!!P.map,Ke=!!P.matcap,gt=!!Q,Y=!!P.aoMap,dn=!!P.lightMap,yt=!!P.bumpMap,xt=!!P.normalMap,Qe=!!P.displacementMap,Pt=!!P.emissiveMap,qe=!!P.metalnessMap,U=!!P.roughnessMap,C=P.anisotropy>0,se=P.clearcoat>0,me=P.dispersion>0,ve=P.iridescence>0,he=P.sheen>0,je=P.transmission>0,Re=C&&!!P.anisotropyMap,ke=se&&!!P.clearcoatMap,pt=se&&!!P.clearcoatNormalMap,Me=se&&!!P.clearcoatRoughnessMap,ze=ve&&!!P.iridescenceMap,tt=ve&&!!P.iridescenceThicknessMap,it=he&&!!P.sheenColorMap,Be=he&&!!P.sheenRoughnessMap,vt=!!P.specularMap,at=!!P.specularColorMap,Rt=!!P.specularIntensityMap,$=je&&!!P.transmissionMap,Pe=je&&!!P.thicknessMap,de=!!P.gradientMap,pe=!!P.alphaMap,De=P.alphaTest>0,Le=!!P.alphaHash,lt=!!P.extensions;let Ot=Dr;P.toneMapped&&(xe===null||xe.isXRRenderTarget===!0)&&(Ot=s.toneMapping);const en={shaderID:X,shaderType:P.type,shaderName:P.name,vertexShader:be,fragmentShader:ne,defines:P.defines,customVertexShaderID:fe,customFragmentShaderID:Se,isRawShaderMaterial:P.isRawShaderMaterial===!0,glslVersion:P.glslVersion,precision:M,batching:Ce,batchingColor:Ce&&J._colorsTexture!==null,instancing:Ie,instancingColor:Ie&&J.instanceColor!==null,instancingMorph:Ie&&J.morphTexture!==null,supportsVertexTextures:v,outputColorSpace:xe===null?s.outputColorSpace:xe.isXRRenderTarget===!0?xe.texture.colorSpace:go,alphaToCoverage:!!P.alphaToCoverage,map:Ze,matcap:Ke,envMap:gt,envMapMode:gt&&Q.mapping,envMapCubeUVHeight:z,aoMap:Y,lightMap:dn,bumpMap:yt,normalMap:xt,displacementMap:v&&Qe,emissiveMap:Pt,normalMapObjectSpace:xt&&P.normalMapType===wy,normalMapTangentSpace:xt&&P.normalMapType===Zg,metalnessMap:qe,roughnessMap:U,anisotropy:C,anisotropyMap:Re,clearcoat:se,clearcoatMap:ke,clearcoatNormalMap:pt,clearcoatRoughnessMap:Me,dispersion:me,iridescence:ve,iridescenceMap:ze,iridescenceThicknessMap:tt,sheen:he,sheenColorMap:it,sheenRoughnessMap:Be,specularMap:vt,specularColorMap:at,specularIntensityMap:Rt,transmission:je,transmissionMap:$,thicknessMap:Pe,gradientMap:de,opaque:P.transparent===!1&&P.blending===oo&&P.alphaToCoverage===!1,alphaMap:pe,alphaTest:De,alphaHash:Le,combine:P.combine,mapUv:Ze&&b(P.map.channel),aoMapUv:Y&&b(P.aoMap.channel),lightMapUv:dn&&b(P.lightMap.channel),bumpMapUv:yt&&b(P.bumpMap.channel),normalMapUv:xt&&b(P.normalMap.channel),displacementMapUv:Qe&&b(P.displacementMap.channel),emissiveMapUv:Pt&&b(P.emissiveMap.channel),metalnessMapUv:qe&&b(P.metalnessMap.channel),roughnessMapUv:U&&b(P.roughnessMap.channel),anisotropyMapUv:Re&&b(P.anisotropyMap.channel),clearcoatMapUv:ke&&b(P.clearcoatMap.channel),clearcoatNormalMapUv:pt&&b(P.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:Me&&b(P.clearcoatRoughnessMap.channel),iridescenceMapUv:ze&&b(P.iridescenceMap.channel),iridescenceThicknessMapUv:tt&&b(P.iridescenceThicknessMap.channel),sheenColorMapUv:it&&b(P.sheenColorMap.channel),sheenRoughnessMapUv:Be&&b(P.sheenRoughnessMap.channel),specularMapUv:vt&&b(P.specularMap.channel),specularColorMapUv:at&&b(P.specularColorMap.channel),specularIntensityMapUv:Rt&&b(P.specularIntensityMap.channel),transmissionMapUv:$&&b(P.transmissionMap.channel),thicknessMapUv:Pe&&b(P.thicknessMap.channel),alphaMapUv:pe&&b(P.alphaMap.channel),vertexTangents:!!ce.attributes.tangent&&(xt||C),vertexColors:P.vertexColors,vertexAlphas:P.vertexColors===!0&&!!ce.attributes.color&&ce.attributes.color.itemSize===4,pointsUvs:J.isPoints===!0&&!!ce.attributes.uv&&(Ze||pe),fog:!!oe,useFog:P.fog===!0,fogExp2:!!oe&&oe.isFogExp2,flatShading:P.flatShading===!0,sizeAttenuation:P.sizeAttenuation===!0,logarithmicDepthBuffer:_,reverseDepthBuffer:Ae,skinning:J.isSkinnedMesh===!0,morphTargets:ce.morphAttributes.position!==void 0,morphNormals:ce.morphAttributes.normal!==void 0,morphColors:ce.morphAttributes.color!==void 0,morphTargetsCount:I,morphTextureStride:ie,numDirLights:A.directional.length,numPointLights:A.point.length,numSpotLights:A.spot.length,numSpotLightMaps:A.spotLightMap.length,numRectAreaLights:A.rectArea.length,numHemiLights:A.hemi.length,numDirLightShadows:A.directionalShadowMap.length,numPointLightShadows:A.pointShadowMap.length,numSpotLightShadows:A.spotShadowMap.length,numSpotLightShadowsWithMaps:A.numSpotLightShadowsWithMaps,numLightProbes:A.numLightProbes,numClippingPlanes:u.numPlanes,numClipIntersection:u.numIntersection,dithering:P.dithering,shadowMapEnabled:s.shadowMap.enabled&&H.length>0,shadowMapType:s.shadowMap.type,toneMapping:Ot,decodeVideoTexture:Ze&&P.map.isVideoTexture===!0&&Tt.getTransfer(P.map.colorSpace)===Lt,decodeVideoTextureEmissive:Pt&&P.emissiveMap.isVideoTexture===!0&&Tt.getTransfer(P.emissiveMap.colorSpace)===Lt,premultipliedAlpha:P.premultipliedAlpha,doubleSided:P.side===Ni,flipSided:P.side===Ln,useDepthPacking:P.depthPacking>=0,depthPacking:P.depthPacking||0,index0AttributeName:P.index0AttributeName,extensionClipCullDistance:lt&&P.extensions.clipCullDistance===!0&&r.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(lt&&P.extensions.multiDraw===!0||Ce)&&r.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:r.has("KHR_parallel_shader_compile"),customProgramCacheKey:P.customProgramCacheKey()};return en.vertexUv1s=m.has(1),en.vertexUv2s=m.has(2),en.vertexUv3s=m.has(3),m.clear(),en}function x(P){const A=[];if(P.shaderID?A.push(P.shaderID):(A.push(P.customVertexShaderID),A.push(P.customFragmentShaderID)),P.defines!==void 0)for(const H in P.defines)A.push(H),A.push(P.defines[H]);return P.isRawShaderMaterial===!1&&(L(A,P),N(A,P),A.push(s.outputColorSpace)),A.push(P.customProgramCacheKey),A.join()}function L(P,A){P.push(A.precision),P.push(A.outputColorSpace),P.push(A.envMapMode),P.push(A.envMapCubeUVHeight),P.push(A.mapUv),P.push(A.alphaMapUv),P.push(A.lightMapUv),P.push(A.aoMapUv),P.push(A.bumpMapUv),P.push(A.normalMapUv),P.push(A.displacementMapUv),P.push(A.emissiveMapUv),P.push(A.metalnessMapUv),P.push(A.roughnessMapUv),P.push(A.anisotropyMapUv),P.push(A.clearcoatMapUv),P.push(A.clearcoatNormalMapUv),P.push(A.clearcoatRoughnessMapUv),P.push(A.iridescenceMapUv),P.push(A.iridescenceThicknessMapUv),P.push(A.sheenColorMapUv),P.push(A.sheenRoughnessMapUv),P.push(A.specularMapUv),P.push(A.specularColorMapUv),P.push(A.specularIntensityMapUv),P.push(A.transmissionMapUv),P.push(A.thicknessMapUv),P.push(A.combine),P.push(A.fogExp2),P.push(A.sizeAttenuation),P.push(A.morphTargetsCount),P.push(A.morphAttributeCount),P.push(A.numDirLights),P.push(A.numPointLights),P.push(A.numSpotLights),P.push(A.numSpotLightMaps),P.push(A.numHemiLights),P.push(A.numRectAreaLights),P.push(A.numDirLightShadows),P.push(A.numPointLightShadows),P.push(A.numSpotLightShadows),P.push(A.numSpotLightShadowsWithMaps),P.push(A.numLightProbes),P.push(A.shadowMapType),P.push(A.toneMapping),P.push(A.numClippingPlanes),P.push(A.numClipIntersection),P.push(A.depthPacking)}function N(P,A){d.disableAll(),A.supportsVertexTextures&&d.enable(0),A.instancing&&d.enable(1),A.instancingColor&&d.enable(2),A.instancingMorph&&d.enable(3),A.matcap&&d.enable(4),A.envMap&&d.enable(5),A.normalMapObjectSpace&&d.enable(6),A.normalMapTangentSpace&&d.enable(7),A.clearcoat&&d.enable(8),A.iridescence&&d.enable(9),A.alphaTest&&d.enable(10),A.vertexColors&&d.enable(11),A.vertexAlphas&&d.enable(12),A.vertexUv1s&&d.enable(13),A.vertexUv2s&&d.enable(14),A.vertexUv3s&&d.enable(15),A.vertexTangents&&d.enable(16),A.anisotropy&&d.enable(17),A.alphaHash&&d.enable(18),A.batching&&d.enable(19),A.dispersion&&d.enable(20),A.batchingColor&&d.enable(21),P.push(d.mask),d.disableAll(),A.fog&&d.enable(0),A.useFog&&d.enable(1),A.flatShading&&d.enable(2),A.logarithmicDepthBuffer&&d.enable(3),A.reverseDepthBuffer&&d.enable(4),A.skinning&&d.enable(5),A.morphTargets&&d.enable(6),A.morphNormals&&d.enable(7),A.morphColors&&d.enable(8),A.premultipliedAlpha&&d.enable(9),A.shadowMapEnabled&&d.enable(10),A.doubleSided&&d.enable(11),A.flipSided&&d.enable(12),A.useDepthPacking&&d.enable(13),A.dithering&&d.enable(14),A.transmission&&d.enable(15),A.sheen&&d.enable(16),A.opaque&&d.enable(17),A.pointsUvs&&d.enable(18),A.decodeVideoTexture&&d.enable(19),A.decodeVideoTextureEmissive&&d.enable(20),A.alphaToCoverage&&d.enable(21),P.push(d.mask)}function w(P){const A=T[P.type];let H;if(A){const te=Pi[A];H=Jy.clone(te.uniforms)}else H=P.uniforms;return H}function O(P,A){let H;for(let te=0,J=g.length;te<J;te++){const oe=g[te];if(oe.cacheKey===A){H=oe,++H.usedTimes;break}}return H===void 0&&(H=new fw(s,A,P,l),g.push(H)),H}function D(P){if(--P.usedTimes===0){const A=g.indexOf(P);g[A]=g[g.length-1],g.pop(),P.destroy()}}function F(P){h.remove(P)}function B(){h.dispose()}return{getParameters:y,getProgramCacheKey:x,getUniforms:w,acquireProgram:O,releaseProgram:D,releaseShaderCache:F,programs:g,dispose:B}}function xw(){let s=new WeakMap;function e(u){return s.has(u)}function t(u){let d=s.get(u);return d===void 0&&(d={},s.set(u,d)),d}function r(u){s.delete(u)}function a(u,d,h){s.get(u)[d]=h}function l(){s=new WeakMap}return{has:e,get:t,remove:r,update:a,dispose:l}}function vw(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.material.id!==e.material.id?s.material.id-e.material.id:s.z!==e.z?s.z-e.z:s.id-e.id}function m0(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function g0(){const s=[];let e=0;const t=[],r=[],a=[];function l(){e=0,t.length=0,r.length=0,a.length=0}function u(_,v,M,T,b,y){let x=s[e];return x===void 0?(x={id:_.id,object:_,geometry:v,material:M,groupOrder:T,renderOrder:_.renderOrder,z:b,group:y},s[e]=x):(x.id=_.id,x.object=_,x.geometry=v,x.material=M,x.groupOrder=T,x.renderOrder=_.renderOrder,x.z=b,x.group=y),e++,x}function d(_,v,M,T,b,y){const x=u(_,v,M,T,b,y);M.transmission>0?r.push(x):M.transparent===!0?a.push(x):t.push(x)}function h(_,v,M,T,b,y){const x=u(_,v,M,T,b,y);M.transmission>0?r.unshift(x):M.transparent===!0?a.unshift(x):t.unshift(x)}function m(_,v){t.length>1&&t.sort(_||vw),r.length>1&&r.sort(v||m0),a.length>1&&a.sort(v||m0)}function g(){for(let _=e,v=s.length;_<v;_++){const M=s[_];if(M.id===null)break;M.id=null,M.object=null,M.geometry=null,M.material=null,M.group=null}}return{opaque:t,transmissive:r,transparent:a,init:l,push:d,unshift:h,finish:g,sort:m}}function _w(){let s=new WeakMap;function e(r,a){const l=s.get(r);let u;return l===void 0?(u=new g0,s.set(r,[u])):a>=l.length?(u=new g0,l.push(u)):u=l[a],u}function t(){s=new WeakMap}return{get:e,dispose:t}}function yw(){const s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new V,color:new mt};break;case"SpotLight":t={position:new V,direction:new V,color:new mt,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new V,color:new mt,distance:0,decay:0};break;case"HemisphereLight":t={direction:new V,skyColor:new mt,groundColor:new mt};break;case"RectAreaLight":t={color:new mt,position:new V,halfWidth:new V,halfHeight:new V};break}return s[e.id]=t,t}}}function Sw(){const s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ut};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ut};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ut,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[e.id]=t,t}}}let Mw=0;function Ew(s,e){return(e.castShadow?2:0)-(s.castShadow?2:0)+(e.map?1:0)-(s.map?1:0)}function ww(s){const e=new yw,t=Sw(),r={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let m=0;m<9;m++)r.probe.push(new V);const a=new V,l=new Ft,u=new Ft;function d(m){let g=0,_=0,v=0;for(let P=0;P<9;P++)r.probe[P].set(0,0,0);let M=0,T=0,b=0,y=0,x=0,L=0,N=0,w=0,O=0,D=0,F=0;m.sort(Ew);for(let P=0,A=m.length;P<A;P++){const H=m[P],te=H.color,J=H.intensity,oe=H.distance,ce=H.shadow&&H.shadow.map?H.shadow.map.texture:null;if(H.isAmbientLight)g+=te.r*J,_+=te.g*J,v+=te.b*J;else if(H.isLightProbe){for(let j=0;j<9;j++)r.probe[j].addScaledVector(H.sh.coefficients[j],J);F++}else if(H.isDirectionalLight){const j=e.get(H);if(j.color.copy(H.color).multiplyScalar(H.intensity),H.castShadow){const Q=H.shadow,z=t.get(H);z.shadowIntensity=Q.intensity,z.shadowBias=Q.bias,z.shadowNormalBias=Q.normalBias,z.shadowRadius=Q.radius,z.shadowMapSize=Q.mapSize,r.directionalShadow[M]=z,r.directionalShadowMap[M]=ce,r.directionalShadowMatrix[M]=H.shadow.matrix,L++}r.directional[M]=j,M++}else if(H.isSpotLight){const j=e.get(H);j.position.setFromMatrixPosition(H.matrixWorld),j.color.copy(te).multiplyScalar(J),j.distance=oe,j.coneCos=Math.cos(H.angle),j.penumbraCos=Math.cos(H.angle*(1-H.penumbra)),j.decay=H.decay,r.spot[b]=j;const Q=H.shadow;if(H.map&&(r.spotLightMap[O]=H.map,O++,Q.updateMatrices(H),H.castShadow&&D++),r.spotLightMatrix[b]=Q.matrix,H.castShadow){const z=t.get(H);z.shadowIntensity=Q.intensity,z.shadowBias=Q.bias,z.shadowNormalBias=Q.normalBias,z.shadowRadius=Q.radius,z.shadowMapSize=Q.mapSize,r.spotShadow[b]=z,r.spotShadowMap[b]=ce,w++}b++}else if(H.isRectAreaLight){const j=e.get(H);j.color.copy(te).multiplyScalar(J),j.halfWidth.set(H.width*.5,0,0),j.halfHeight.set(0,H.height*.5,0),r.rectArea[y]=j,y++}else if(H.isPointLight){const j=e.get(H);if(j.color.copy(H.color).multiplyScalar(H.intensity),j.distance=H.distance,j.decay=H.decay,H.castShadow){const Q=H.shadow,z=t.get(H);z.shadowIntensity=Q.intensity,z.shadowBias=Q.bias,z.shadowNormalBias=Q.normalBias,z.shadowRadius=Q.radius,z.shadowMapSize=Q.mapSize,z.shadowCameraNear=Q.camera.near,z.shadowCameraFar=Q.camera.far,r.pointShadow[T]=z,r.pointShadowMap[T]=ce,r.pointShadowMatrix[T]=H.shadow.matrix,N++}r.point[T]=j,T++}else if(H.isHemisphereLight){const j=e.get(H);j.skyColor.copy(H.color).multiplyScalar(J),j.groundColor.copy(H.groundColor).multiplyScalar(J),r.hemi[x]=j,x++}}y>0&&(s.has("OES_texture_float_linear")===!0?(r.rectAreaLTC1=Ne.LTC_FLOAT_1,r.rectAreaLTC2=Ne.LTC_FLOAT_2):(r.rectAreaLTC1=Ne.LTC_HALF_1,r.rectAreaLTC2=Ne.LTC_HALF_2)),r.ambient[0]=g,r.ambient[1]=_,r.ambient[2]=v;const B=r.hash;(B.directionalLength!==M||B.pointLength!==T||B.spotLength!==b||B.rectAreaLength!==y||B.hemiLength!==x||B.numDirectionalShadows!==L||B.numPointShadows!==N||B.numSpotShadows!==w||B.numSpotMaps!==O||B.numLightProbes!==F)&&(r.directional.length=M,r.spot.length=b,r.rectArea.length=y,r.point.length=T,r.hemi.length=x,r.directionalShadow.length=L,r.directionalShadowMap.length=L,r.pointShadow.length=N,r.pointShadowMap.length=N,r.spotShadow.length=w,r.spotShadowMap.length=w,r.directionalShadowMatrix.length=L,r.pointShadowMatrix.length=N,r.spotLightMatrix.length=w+O-D,r.spotLightMap.length=O,r.numSpotLightShadowsWithMaps=D,r.numLightProbes=F,B.directionalLength=M,B.pointLength=T,B.spotLength=b,B.rectAreaLength=y,B.hemiLength=x,B.numDirectionalShadows=L,B.numPointShadows=N,B.numSpotShadows=w,B.numSpotMaps=O,B.numLightProbes=F,r.version=Mw++)}function h(m,g){let _=0,v=0,M=0,T=0,b=0;const y=g.matrixWorldInverse;for(let x=0,L=m.length;x<L;x++){const N=m[x];if(N.isDirectionalLight){const w=r.directional[_];w.direction.setFromMatrixPosition(N.matrixWorld),a.setFromMatrixPosition(N.target.matrixWorld),w.direction.sub(a),w.direction.transformDirection(y),_++}else if(N.isSpotLight){const w=r.spot[M];w.position.setFromMatrixPosition(N.matrixWorld),w.position.applyMatrix4(y),w.direction.setFromMatrixPosition(N.matrixWorld),a.setFromMatrixPosition(N.target.matrixWorld),w.direction.sub(a),w.direction.transformDirection(y),M++}else if(N.isRectAreaLight){const w=r.rectArea[T];w.position.setFromMatrixPosition(N.matrixWorld),w.position.applyMatrix4(y),u.identity(),l.copy(N.matrixWorld),l.premultiply(y),u.extractRotation(l),w.halfWidth.set(N.width*.5,0,0),w.halfHeight.set(0,N.height*.5,0),w.halfWidth.applyMatrix4(u),w.halfHeight.applyMatrix4(u),T++}else if(N.isPointLight){const w=r.point[v];w.position.setFromMatrixPosition(N.matrixWorld),w.position.applyMatrix4(y),v++}else if(N.isHemisphereLight){const w=r.hemi[b];w.direction.setFromMatrixPosition(N.matrixWorld),w.direction.transformDirection(y),b++}}}return{setup:d,setupView:h,state:r}}function x0(s){const e=new ww(s),t=[],r=[];function a(g){m.camera=g,t.length=0,r.length=0}function l(g){t.push(g)}function u(g){r.push(g)}function d(){e.setup(t)}function h(g){e.setupView(t,g)}const m={lightsArray:t,shadowsArray:r,camera:null,lights:e,transmissionRenderTarget:{}};return{init:a,state:m,setupLights:d,setupLightsView:h,pushLight:l,pushShadow:u}}function Tw(s){let e=new WeakMap;function t(a,l=0){const u=e.get(a);let d;return u===void 0?(d=new x0(s),e.set(a,[d])):l>=u.length?(d=new x0(s),u.push(d)):d=u[l],d}function r(){e=new WeakMap}return{get:t,dispose:r}}class bw extends ps{static get type(){return"MeshDepthMaterial"}constructor(e){super(),this.isMeshDepthMaterial=!0,this.depthPacking=My,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}}class Aw extends ps{static get type(){return"MeshDistanceMaterial"}constructor(e){super(),this.isMeshDistanceMaterial=!0,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}}const Cw=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Rw=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Pw(s,e,t){let r=new Vf;const a=new ut,l=new ut,u=new qt,d=new bw({depthPacking:Ey}),h=new Aw,m={},g=t.maxTextureSize,_={[Ur]:Ln,[Ln]:Ur,[Ni]:Ni},v=new tr({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ut},radius:{value:4}},vertexShader:Cw,fragmentShader:Rw}),M=v.clone();M.defines.HORIZONTAL_PASS=1;const T=new Xt;T.setAttribute("position",new Si(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const b=new Fe(T,v),y=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Ug;let x=this.type;this.render=function(D,F,B){if(y.enabled===!1||y.autoUpdate===!1&&y.needsUpdate===!1||D.length===0)return;const P=s.getRenderTarget(),A=s.getActiveCubeFace(),H=s.getActiveMipmapLevel(),te=s.state;te.setBlending(Lr),te.buffers.color.setClear(1,1,1,1),te.buffers.depth.setTest(!0),te.setScissorTest(!1);const J=x!==qi&&this.type===qi,oe=x===qi&&this.type!==qi;for(let ce=0,j=D.length;ce<j;ce++){const Q=D[ce],z=Q.shadow;if(z===void 0){console.warn("THREE.WebGLShadowMap:",Q,"has no shadow.");continue}if(z.autoUpdate===!1&&z.needsUpdate===!1)continue;a.copy(z.mapSize);const X=z.getFrameExtents();if(a.multiply(X),l.copy(z.mapSize),(a.x>g||a.y>g)&&(a.x>g&&(l.x=Math.floor(g/X.x),a.x=l.x*X.x,z.mapSize.x=l.x),a.y>g&&(l.y=Math.floor(g/X.y),a.y=l.y*X.y,z.mapSize.y=l.y)),z.map===null||J===!0||oe===!0){const I=this.type!==qi?{minFilter:yi,magFilter:yi}:{};z.map!==null&&z.map.dispose(),z.map=new fs(a.x,a.y,I),z.map.texture.name=Q.name+".shadowMap",z.camera.updateProjectionMatrix()}s.setRenderTarget(z.map),s.clear();const q=z.getViewportCount();for(let I=0;I<q;I++){const ie=z.getViewport(I);u.set(l.x*ie.x,l.y*ie.y,l.x*ie.z,l.y*ie.w),te.viewport(u),z.updateMatrices(Q,I),r=z.getFrustum(),w(F,B,z.camera,Q,this.type)}z.isPointLightShadow!==!0&&this.type===qi&&L(z,B),z.needsUpdate=!1}x=this.type,y.needsUpdate=!1,s.setRenderTarget(P,A,H)};function L(D,F){const B=e.update(b);v.defines.VSM_SAMPLES!==D.blurSamples&&(v.defines.VSM_SAMPLES=D.blurSamples,M.defines.VSM_SAMPLES=D.blurSamples,v.needsUpdate=!0,M.needsUpdate=!0),D.mapPass===null&&(D.mapPass=new fs(a.x,a.y)),v.uniforms.shadow_pass.value=D.map.texture,v.uniforms.resolution.value=D.mapSize,v.uniforms.radius.value=D.radius,s.setRenderTarget(D.mapPass),s.clear(),s.renderBufferDirect(F,null,B,v,b,null),M.uniforms.shadow_pass.value=D.mapPass.texture,M.uniforms.resolution.value=D.mapSize,M.uniforms.radius.value=D.radius,s.setRenderTarget(D.map),s.clear(),s.renderBufferDirect(F,null,B,M,b,null)}function N(D,F,B,P){let A=null;const H=B.isPointLight===!0?D.customDistanceMaterial:D.customDepthMaterial;if(H!==void 0)A=H;else if(A=B.isPointLight===!0?h:d,s.localClippingEnabled&&F.clipShadows===!0&&Array.isArray(F.clippingPlanes)&&F.clippingPlanes.length!==0||F.displacementMap&&F.displacementScale!==0||F.alphaMap&&F.alphaTest>0||F.map&&F.alphaTest>0){const te=A.uuid,J=F.uuid;let oe=m[te];oe===void 0&&(oe={},m[te]=oe);let ce=oe[J];ce===void 0&&(ce=A.clone(),oe[J]=ce,F.addEventListener("dispose",O)),A=ce}if(A.visible=F.visible,A.wireframe=F.wireframe,P===qi?A.side=F.shadowSide!==null?F.shadowSide:F.side:A.side=F.shadowSide!==null?F.shadowSide:_[F.side],A.alphaMap=F.alphaMap,A.alphaTest=F.alphaTest,A.map=F.map,A.clipShadows=F.clipShadows,A.clippingPlanes=F.clippingPlanes,A.clipIntersection=F.clipIntersection,A.displacementMap=F.displacementMap,A.displacementScale=F.displacementScale,A.displacementBias=F.displacementBias,A.wireframeLinewidth=F.wireframeLinewidth,A.linewidth=F.linewidth,B.isPointLight===!0&&A.isMeshDistanceMaterial===!0){const te=s.properties.get(A);te.light=B}return A}function w(D,F,B,P,A){if(D.visible===!1)return;if(D.layers.test(F.layers)&&(D.isMesh||D.isLine||D.isPoints)&&(D.castShadow||D.receiveShadow&&A===qi)&&(!D.frustumCulled||r.intersectsObject(D))){D.modelViewMatrix.multiplyMatrices(B.matrixWorldInverse,D.matrixWorld);const J=e.update(D),oe=D.material;if(Array.isArray(oe)){const ce=J.groups;for(let j=0,Q=ce.length;j<Q;j++){const z=ce[j],X=oe[z.materialIndex];if(X&&X.visible){const q=N(D,X,P,A);D.onBeforeShadow(s,D,F,B,J,q,z),s.renderBufferDirect(B,null,J,q,D,z),D.onAfterShadow(s,D,F,B,J,q,z)}}}else if(oe.visible){const ce=N(D,oe,P,A);D.onBeforeShadow(s,D,F,B,J,ce,null),s.renderBufferDirect(B,null,J,ce,D,null),D.onAfterShadow(s,D,F,B,J,ce,null)}}const te=D.children;for(let J=0,oe=te.length;J<oe;J++)w(te[J],F,B,P,A)}function O(D){D.target.removeEventListener("dispose",O);for(const B in m){const P=m[B],A=D.target.uuid;A in P&&(P[A].dispose(),delete P[A])}}}const Nw={[Vd]:Gd,[jd]:$d,[Wd]:Yd,[co]:Xd,[Gd]:Vd,[$d]:jd,[Yd]:Wd,[Xd]:co};function Lw(s,e){function t(){let $=!1;const Pe=new qt;let de=null;const pe=new qt(0,0,0,0);return{setMask:function(De){de!==De&&!$&&(s.colorMask(De,De,De,De),de=De)},setLocked:function(De){$=De},setClear:function(De,Le,lt,Ot,en){en===!0&&(De*=Ot,Le*=Ot,lt*=Ot),Pe.set(De,Le,lt,Ot),pe.equals(Pe)===!1&&(s.clearColor(De,Le,lt,Ot),pe.copy(Pe))},reset:function(){$=!1,de=null,pe.set(-1,0,0,0)}}}function r(){let $=!1,Pe=!1,de=null,pe=null,De=null;return{setReversed:function(Le){if(Pe!==Le){const lt=e.get("EXT_clip_control");Pe?lt.clipControlEXT(lt.LOWER_LEFT_EXT,lt.ZERO_TO_ONE_EXT):lt.clipControlEXT(lt.LOWER_LEFT_EXT,lt.NEGATIVE_ONE_TO_ONE_EXT);const Ot=De;De=null,this.setClear(Ot)}Pe=Le},getReversed:function(){return Pe},setTest:function(Le){Le?xe(s.DEPTH_TEST):Ae(s.DEPTH_TEST)},setMask:function(Le){de!==Le&&!$&&(s.depthMask(Le),de=Le)},setFunc:function(Le){if(Pe&&(Le=Nw[Le]),pe!==Le){switch(Le){case Vd:s.depthFunc(s.NEVER);break;case Gd:s.depthFunc(s.ALWAYS);break;case jd:s.depthFunc(s.LESS);break;case co:s.depthFunc(s.LEQUAL);break;case Wd:s.depthFunc(s.EQUAL);break;case Xd:s.depthFunc(s.GEQUAL);break;case $d:s.depthFunc(s.GREATER);break;case Yd:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}pe=Le}},setLocked:function(Le){$=Le},setClear:function(Le){De!==Le&&(Pe&&(Le=1-Le),s.clearDepth(Le),De=Le)},reset:function(){$=!1,de=null,pe=null,De=null,Pe=!1}}}function a(){let $=!1,Pe=null,de=null,pe=null,De=null,Le=null,lt=null,Ot=null,en=null;return{setTest:function(Et){$||(Et?xe(s.STENCIL_TEST):Ae(s.STENCIL_TEST))},setMask:function(Et){Pe!==Et&&!$&&(s.stencilMask(Et),Pe=Et)},setFunc:function(Et,In,Tn){(de!==Et||pe!==In||De!==Tn)&&(s.stencilFunc(Et,In,Tn),de=Et,pe=In,De=Tn)},setOp:function(Et,In,Tn){(Le!==Et||lt!==In||Ot!==Tn)&&(s.stencilOp(Et,In,Tn),Le=Et,lt=In,Ot=Tn)},setLocked:function(Et){$=Et},setClear:function(Et){en!==Et&&(s.clearStencil(Et),en=Et)},reset:function(){$=!1,Pe=null,de=null,pe=null,De=null,Le=null,lt=null,Ot=null,en=null}}}const l=new t,u=new r,d=new a,h=new WeakMap,m=new WeakMap;let g={},_={},v=new WeakMap,M=[],T=null,b=!1,y=null,x=null,L=null,N=null,w=null,O=null,D=null,F=new mt(0,0,0),B=0,P=!1,A=null,H=null,te=null,J=null,oe=null;const ce=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let j=!1,Q=0;const z=s.getParameter(s.VERSION);z.indexOf("WebGL")!==-1?(Q=parseFloat(/^WebGL (\d)/.exec(z)[1]),j=Q>=1):z.indexOf("OpenGL ES")!==-1&&(Q=parseFloat(/^OpenGL ES (\d)/.exec(z)[1]),j=Q>=2);let X=null,q={};const I=s.getParameter(s.SCISSOR_BOX),ie=s.getParameter(s.VIEWPORT),be=new qt().fromArray(I),ne=new qt().fromArray(ie);function fe($,Pe,de,pe){const De=new Uint8Array(4),Le=s.createTexture();s.bindTexture($,Le),s.texParameteri($,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri($,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let lt=0;lt<de;lt++)$===s.TEXTURE_3D||$===s.TEXTURE_2D_ARRAY?s.texImage3D(Pe,0,s.RGBA,1,1,pe,0,s.RGBA,s.UNSIGNED_BYTE,De):s.texImage2D(Pe+lt,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,De);return Le}const Se={};Se[s.TEXTURE_2D]=fe(s.TEXTURE_2D,s.TEXTURE_2D,1),Se[s.TEXTURE_CUBE_MAP]=fe(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),Se[s.TEXTURE_2D_ARRAY]=fe(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),Se[s.TEXTURE_3D]=fe(s.TEXTURE_3D,s.TEXTURE_3D,1,1),l.setClear(0,0,0,1),u.setClear(1),d.setClear(0),xe(s.DEPTH_TEST),u.setFunc(co),yt(!1),xt(Mm),xe(s.CULL_FACE),Y(Lr);function xe($){g[$]!==!0&&(s.enable($),g[$]=!0)}function Ae($){g[$]!==!1&&(s.disable($),g[$]=!1)}function Ie($,Pe){return _[$]!==Pe?(s.bindFramebuffer($,Pe),_[$]=Pe,$===s.DRAW_FRAMEBUFFER&&(_[s.FRAMEBUFFER]=Pe),$===s.FRAMEBUFFER&&(_[s.DRAW_FRAMEBUFFER]=Pe),!0):!1}function Ce($,Pe){let de=M,pe=!1;if($){de=v.get(Pe),de===void 0&&(de=[],v.set(Pe,de));const De=$.textures;if(de.length!==De.length||de[0]!==s.COLOR_ATTACHMENT0){for(let Le=0,lt=De.length;Le<lt;Le++)de[Le]=s.COLOR_ATTACHMENT0+Le;de.length=De.length,pe=!0}}else de[0]!==s.BACK&&(de[0]=s.BACK,pe=!0);pe&&s.drawBuffers(de)}function Ze($){return T!==$?(s.useProgram($),T=$,!0):!1}const Ke={[as]:s.FUNC_ADD,[Z_]:s.FUNC_SUBTRACT,[K_]:s.FUNC_REVERSE_SUBTRACT};Ke[Q_]=s.MIN,Ke[J_]=s.MAX;const gt={[ey]:s.ZERO,[ty]:s.ONE,[ny]:s.SRC_COLOR,[Bd]:s.SRC_ALPHA,[ly]:s.SRC_ALPHA_SATURATE,[oy]:s.DST_COLOR,[ry]:s.DST_ALPHA,[iy]:s.ONE_MINUS_SRC_COLOR,[Hd]:s.ONE_MINUS_SRC_ALPHA,[ay]:s.ONE_MINUS_DST_COLOR,[sy]:s.ONE_MINUS_DST_ALPHA,[cy]:s.CONSTANT_COLOR,[uy]:s.ONE_MINUS_CONSTANT_COLOR,[dy]:s.CONSTANT_ALPHA,[fy]:s.ONE_MINUS_CONSTANT_ALPHA};function Y($,Pe,de,pe,De,Le,lt,Ot,en,Et){if($===Lr){b===!0&&(Ae(s.BLEND),b=!1);return}if(b===!1&&(xe(s.BLEND),b=!0),$!==q_){if($!==y||Et!==P){if((x!==as||w!==as)&&(s.blendEquation(s.FUNC_ADD),x=as,w=as),Et)switch($){case oo:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Em:s.blendFunc(s.ONE,s.ONE);break;case wm:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Tm:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",$);break}else switch($){case oo:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case Em:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case wm:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Tm:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",$);break}L=null,N=null,O=null,D=null,F.set(0,0,0),B=0,y=$,P=Et}return}De=De||Pe,Le=Le||de,lt=lt||pe,(Pe!==x||De!==w)&&(s.blendEquationSeparate(Ke[Pe],Ke[De]),x=Pe,w=De),(de!==L||pe!==N||Le!==O||lt!==D)&&(s.blendFuncSeparate(gt[de],gt[pe],gt[Le],gt[lt]),L=de,N=pe,O=Le,D=lt),(Ot.equals(F)===!1||en!==B)&&(s.blendColor(Ot.r,Ot.g,Ot.b,en),F.copy(Ot),B=en),y=$,P=!1}function dn($,Pe){$.side===Ni?Ae(s.CULL_FACE):xe(s.CULL_FACE);let de=$.side===Ln;Pe&&(de=!de),yt(de),$.blending===oo&&$.transparent===!1?Y(Lr):Y($.blending,$.blendEquation,$.blendSrc,$.blendDst,$.blendEquationAlpha,$.blendSrcAlpha,$.blendDstAlpha,$.blendColor,$.blendAlpha,$.premultipliedAlpha),u.setFunc($.depthFunc),u.setTest($.depthTest),u.setMask($.depthWrite),l.setMask($.colorWrite);const pe=$.stencilWrite;d.setTest(pe),pe&&(d.setMask($.stencilWriteMask),d.setFunc($.stencilFunc,$.stencilRef,$.stencilFuncMask),d.setOp($.stencilFail,$.stencilZFail,$.stencilZPass)),Pt($.polygonOffset,$.polygonOffsetFactor,$.polygonOffsetUnits),$.alphaToCoverage===!0?xe(s.SAMPLE_ALPHA_TO_COVERAGE):Ae(s.SAMPLE_ALPHA_TO_COVERAGE)}function yt($){A!==$&&($?s.frontFace(s.CW):s.frontFace(s.CCW),A=$)}function xt($){$!==$_?(xe(s.CULL_FACE),$!==H&&($===Mm?s.cullFace(s.BACK):$===Y_?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):Ae(s.CULL_FACE),H=$}function Qe($){$!==te&&(j&&s.lineWidth($),te=$)}function Pt($,Pe,de){$?(xe(s.POLYGON_OFFSET_FILL),(J!==Pe||oe!==de)&&(s.polygonOffset(Pe,de),J=Pe,oe=de)):Ae(s.POLYGON_OFFSET_FILL)}function qe($){$?xe(s.SCISSOR_TEST):Ae(s.SCISSOR_TEST)}function U($){$===void 0&&($=s.TEXTURE0+ce-1),X!==$&&(s.activeTexture($),X=$)}function C($,Pe,de){de===void 0&&(X===null?de=s.TEXTURE0+ce-1:de=X);let pe=q[de];pe===void 0&&(pe={type:void 0,texture:void 0},q[de]=pe),(pe.type!==$||pe.texture!==Pe)&&(X!==de&&(s.activeTexture(de),X=de),s.bindTexture($,Pe||Se[$]),pe.type=$,pe.texture=Pe)}function se(){const $=q[X];$!==void 0&&$.type!==void 0&&(s.bindTexture($.type,null),$.type=void 0,$.texture=void 0)}function me(){try{s.compressedTexImage2D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function ve(){try{s.compressedTexImage3D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function he(){try{s.texSubImage2D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function je(){try{s.texSubImage3D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function Re(){try{s.compressedTexSubImage2D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function ke(){try{s.compressedTexSubImage3D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function pt(){try{s.texStorage2D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function Me(){try{s.texStorage3D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function ze(){try{s.texImage2D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function tt(){try{s.texImage3D.apply(s,arguments)}catch($){console.error("THREE.WebGLState:",$)}}function it($){be.equals($)===!1&&(s.scissor($.x,$.y,$.z,$.w),be.copy($))}function Be($){ne.equals($)===!1&&(s.viewport($.x,$.y,$.z,$.w),ne.copy($))}function vt($,Pe){let de=m.get(Pe);de===void 0&&(de=new WeakMap,m.set(Pe,de));let pe=de.get($);pe===void 0&&(pe=s.getUniformBlockIndex(Pe,$.name),de.set($,pe))}function at($,Pe){const pe=m.get(Pe).get($);h.get(Pe)!==pe&&(s.uniformBlockBinding(Pe,pe,$.__bindingPointIndex),h.set(Pe,pe))}function Rt(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),u.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),g={},X=null,q={},_={},v=new WeakMap,M=[],T=null,b=!1,y=null,x=null,L=null,N=null,w=null,O=null,D=null,F=new mt(0,0,0),B=0,P=!1,A=null,H=null,te=null,J=null,oe=null,be.set(0,0,s.canvas.width,s.canvas.height),ne.set(0,0,s.canvas.width,s.canvas.height),l.reset(),u.reset(),d.reset()}return{buffers:{color:l,depth:u,stencil:d},enable:xe,disable:Ae,bindFramebuffer:Ie,drawBuffers:Ce,useProgram:Ze,setBlending:Y,setMaterial:dn,setFlipSided:yt,setCullFace:xt,setLineWidth:Qe,setPolygonOffset:Pt,setScissorTest:qe,activeTexture:U,bindTexture:C,unbindTexture:se,compressedTexImage2D:me,compressedTexImage3D:ve,texImage2D:ze,texImage3D:tt,updateUBOMapping:vt,uniformBlockBinding:at,texStorage2D:pt,texStorage3D:Me,texSubImage2D:he,texSubImage3D:je,compressedTexSubImage2D:Re,compressedTexSubImage3D:ke,scissor:it,viewport:Be,reset:Rt}}function v0(s,e,t,r){const a=Dw(r);switch(t){case Gg:return s*e;case Wg:return s*e;case Xg:return s*e*2;case $g:return s*e/a.components*a.byteLength;case kf:return s*e/a.components*a.byteLength;case Yg:return s*e*2/a.components*a.byteLength;case Of:return s*e*2/a.components*a.byteLength;case jg:return s*e*3/a.components*a.byteLength;case _i:return s*e*4/a.components*a.byteLength;case zf:return s*e*4/a.components*a.byteLength;case Kl:case Ql:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case Jl:case ec:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case ef:case nf:return Math.max(s,16)*Math.max(e,8)/4;case Jd:case tf:return Math.max(s,8)*Math.max(e,8)/2;case rf:case sf:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case of:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case af:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case lf:return Math.floor((s+4)/5)*Math.floor((e+3)/4)*16;case cf:return Math.floor((s+4)/5)*Math.floor((e+4)/5)*16;case uf:return Math.floor((s+5)/6)*Math.floor((e+4)/5)*16;case df:return Math.floor((s+5)/6)*Math.floor((e+5)/6)*16;case ff:return Math.floor((s+7)/8)*Math.floor((e+4)/5)*16;case hf:return Math.floor((s+7)/8)*Math.floor((e+5)/6)*16;case pf:return Math.floor((s+7)/8)*Math.floor((e+7)/8)*16;case mf:return Math.floor((s+9)/10)*Math.floor((e+4)/5)*16;case gf:return Math.floor((s+9)/10)*Math.floor((e+5)/6)*16;case xf:return Math.floor((s+9)/10)*Math.floor((e+7)/8)*16;case vf:return Math.floor((s+9)/10)*Math.floor((e+9)/10)*16;case _f:return Math.floor((s+11)/12)*Math.floor((e+9)/10)*16;case yf:return Math.floor((s+11)/12)*Math.floor((e+11)/12)*16;case tc:case Sf:case Mf:return Math.ceil(s/4)*Math.ceil(e/4)*16;case qg:case Ef:return Math.ceil(s/4)*Math.ceil(e/4)*8;case wf:case Tf:return Math.ceil(s/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Dw(s){switch(s){case er:case Bg:return{byteLength:1,components:1};case da:case Hg:case ha:return{byteLength:2,components:1};case Uf:case Ff:return{byteLength:2,components:4};case ds:case If:case Ki:return{byteLength:4,components:1};case Vg:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}function Iw(s,e,t,r,a,l,u){const d=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,h=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),m=new ut,g=new WeakMap;let _;const v=new WeakMap;let M=!1;try{M=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function T(U,C){return M?new OffscreenCanvas(U,C):oc("canvas")}function b(U,C,se){let me=1;const ve=qe(U);if((ve.width>se||ve.height>se)&&(me=se/Math.max(ve.width,ve.height)),me<1)if(typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&U instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&U instanceof ImageBitmap||typeof VideoFrame<"u"&&U instanceof VideoFrame){const he=Math.floor(me*ve.width),je=Math.floor(me*ve.height);_===void 0&&(_=T(he,je));const Re=C?T(he,je):_;return Re.width=he,Re.height=je,Re.getContext("2d").drawImage(U,0,0,he,je),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+ve.width+"x"+ve.height+") to ("+he+"x"+je+")."),Re}else return"data"in U&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+ve.width+"x"+ve.height+")."),U;return U}function y(U){return U.generateMipmaps}function x(U){s.generateMipmap(U)}function L(U){return U.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:U.isWebGL3DRenderTarget?s.TEXTURE_3D:U.isWebGLArrayRenderTarget||U.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function N(U,C,se,me,ve=!1){if(U!==null){if(s[U]!==void 0)return s[U];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+U+"'")}let he=C;if(C===s.RED&&(se===s.FLOAT&&(he=s.R32F),se===s.HALF_FLOAT&&(he=s.R16F),se===s.UNSIGNED_BYTE&&(he=s.R8)),C===s.RED_INTEGER&&(se===s.UNSIGNED_BYTE&&(he=s.R8UI),se===s.UNSIGNED_SHORT&&(he=s.R16UI),se===s.UNSIGNED_INT&&(he=s.R32UI),se===s.BYTE&&(he=s.R8I),se===s.SHORT&&(he=s.R16I),se===s.INT&&(he=s.R32I)),C===s.RG&&(se===s.FLOAT&&(he=s.RG32F),se===s.HALF_FLOAT&&(he=s.RG16F),se===s.UNSIGNED_BYTE&&(he=s.RG8)),C===s.RG_INTEGER&&(se===s.UNSIGNED_BYTE&&(he=s.RG8UI),se===s.UNSIGNED_SHORT&&(he=s.RG16UI),se===s.UNSIGNED_INT&&(he=s.RG32UI),se===s.BYTE&&(he=s.RG8I),se===s.SHORT&&(he=s.RG16I),se===s.INT&&(he=s.RG32I)),C===s.RGB_INTEGER&&(se===s.UNSIGNED_BYTE&&(he=s.RGB8UI),se===s.UNSIGNED_SHORT&&(he=s.RGB16UI),se===s.UNSIGNED_INT&&(he=s.RGB32UI),se===s.BYTE&&(he=s.RGB8I),se===s.SHORT&&(he=s.RGB16I),se===s.INT&&(he=s.RGB32I)),C===s.RGBA_INTEGER&&(se===s.UNSIGNED_BYTE&&(he=s.RGBA8UI),se===s.UNSIGNED_SHORT&&(he=s.RGBA16UI),se===s.UNSIGNED_INT&&(he=s.RGBA32UI),se===s.BYTE&&(he=s.RGBA8I),se===s.SHORT&&(he=s.RGBA16I),se===s.INT&&(he=s.RGBA32I)),C===s.RGB&&se===s.UNSIGNED_INT_5_9_9_9_REV&&(he=s.RGB9_E5),C===s.RGBA){const je=ve?fc:Tt.getTransfer(me);se===s.FLOAT&&(he=s.RGBA32F),se===s.HALF_FLOAT&&(he=s.RGBA16F),se===s.UNSIGNED_BYTE&&(he=je===Lt?s.SRGB8_ALPHA8:s.RGBA8),se===s.UNSIGNED_SHORT_4_4_4_4&&(he=s.RGBA4),se===s.UNSIGNED_SHORT_5_5_5_1&&(he=s.RGB5_A1)}return(he===s.R16F||he===s.R32F||he===s.RG16F||he===s.RG32F||he===s.RGBA16F||he===s.RGBA32F)&&e.get("EXT_color_buffer_float"),he}function w(U,C){let se;return U?C===null||C===ds||C===ho?se=s.DEPTH24_STENCIL8:C===Ki?se=s.DEPTH32F_STENCIL8:C===da&&(se=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):C===null||C===ds||C===ho?se=s.DEPTH_COMPONENT24:C===Ki?se=s.DEPTH_COMPONENT32F:C===da&&(se=s.DEPTH_COMPONENT16),se}function O(U,C){return y(U)===!0||U.isFramebufferTexture&&U.minFilter!==yi&&U.minFilter!==vi?Math.log2(Math.max(C.width,C.height))+1:U.mipmaps!==void 0&&U.mipmaps.length>0?U.mipmaps.length:U.isCompressedTexture&&Array.isArray(U.image)?C.mipmaps.length:1}function D(U){const C=U.target;C.removeEventListener("dispose",D),B(C),C.isVideoTexture&&g.delete(C)}function F(U){const C=U.target;C.removeEventListener("dispose",F),A(C)}function B(U){const C=r.get(U);if(C.__webglInit===void 0)return;const se=U.source,me=v.get(se);if(me){const ve=me[C.__cacheKey];ve.usedTimes--,ve.usedTimes===0&&P(U),Object.keys(me).length===0&&v.delete(se)}r.remove(U)}function P(U){const C=r.get(U);s.deleteTexture(C.__webglTexture);const se=U.source,me=v.get(se);delete me[C.__cacheKey],u.memory.textures--}function A(U){const C=r.get(U);if(U.depthTexture&&(U.depthTexture.dispose(),r.remove(U.depthTexture)),U.isWebGLCubeRenderTarget)for(let me=0;me<6;me++){if(Array.isArray(C.__webglFramebuffer[me]))for(let ve=0;ve<C.__webglFramebuffer[me].length;ve++)s.deleteFramebuffer(C.__webglFramebuffer[me][ve]);else s.deleteFramebuffer(C.__webglFramebuffer[me]);C.__webglDepthbuffer&&s.deleteRenderbuffer(C.__webglDepthbuffer[me])}else{if(Array.isArray(C.__webglFramebuffer))for(let me=0;me<C.__webglFramebuffer.length;me++)s.deleteFramebuffer(C.__webglFramebuffer[me]);else s.deleteFramebuffer(C.__webglFramebuffer);if(C.__webglDepthbuffer&&s.deleteRenderbuffer(C.__webglDepthbuffer),C.__webglMultisampledFramebuffer&&s.deleteFramebuffer(C.__webglMultisampledFramebuffer),C.__webglColorRenderbuffer)for(let me=0;me<C.__webglColorRenderbuffer.length;me++)C.__webglColorRenderbuffer[me]&&s.deleteRenderbuffer(C.__webglColorRenderbuffer[me]);C.__webglDepthRenderbuffer&&s.deleteRenderbuffer(C.__webglDepthRenderbuffer)}const se=U.textures;for(let me=0,ve=se.length;me<ve;me++){const he=r.get(se[me]);he.__webglTexture&&(s.deleteTexture(he.__webglTexture),u.memory.textures--),r.remove(se[me])}r.remove(U)}let H=0;function te(){H=0}function J(){const U=H;return U>=a.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+U+" texture units while this GPU supports only "+a.maxTextures),H+=1,U}function oe(U){const C=[];return C.push(U.wrapS),C.push(U.wrapT),C.push(U.wrapR||0),C.push(U.magFilter),C.push(U.minFilter),C.push(U.anisotropy),C.push(U.internalFormat),C.push(U.format),C.push(U.type),C.push(U.generateMipmaps),C.push(U.premultiplyAlpha),C.push(U.flipY),C.push(U.unpackAlignment),C.push(U.colorSpace),C.join()}function ce(U,C){const se=r.get(U);if(U.isVideoTexture&&Qe(U),U.isRenderTargetTexture===!1&&U.version>0&&se.__version!==U.version){const me=U.image;if(me===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(me.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{ne(se,U,C);return}}t.bindTexture(s.TEXTURE_2D,se.__webglTexture,s.TEXTURE0+C)}function j(U,C){const se=r.get(U);if(U.version>0&&se.__version!==U.version){ne(se,U,C);return}t.bindTexture(s.TEXTURE_2D_ARRAY,se.__webglTexture,s.TEXTURE0+C)}function Q(U,C){const se=r.get(U);if(U.version>0&&se.__version!==U.version){ne(se,U,C);return}t.bindTexture(s.TEXTURE_3D,se.__webglTexture,s.TEXTURE0+C)}function z(U,C){const se=r.get(U);if(U.version>0&&se.__version!==U.version){fe(se,U,C);return}t.bindTexture(s.TEXTURE_CUBE_MAP,se.__webglTexture,s.TEXTURE0+C)}const X={[Kd]:s.REPEAT,[cs]:s.CLAMP_TO_EDGE,[Qd]:s.MIRRORED_REPEAT},q={[yi]:s.NEAREST,[Sy]:s.NEAREST_MIPMAP_NEAREST,[Ml]:s.NEAREST_MIPMAP_LINEAR,[vi]:s.LINEAR,[td]:s.LINEAR_MIPMAP_NEAREST,[us]:s.LINEAR_MIPMAP_LINEAR},I={[Ty]:s.NEVER,[Ny]:s.ALWAYS,[by]:s.LESS,[Kg]:s.LEQUAL,[Ay]:s.EQUAL,[Py]:s.GEQUAL,[Cy]:s.GREATER,[Ry]:s.NOTEQUAL};function ie(U,C){if(C.type===Ki&&e.has("OES_texture_float_linear")===!1&&(C.magFilter===vi||C.magFilter===td||C.magFilter===Ml||C.magFilter===us||C.minFilter===vi||C.minFilter===td||C.minFilter===Ml||C.minFilter===us)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(U,s.TEXTURE_WRAP_S,X[C.wrapS]),s.texParameteri(U,s.TEXTURE_WRAP_T,X[C.wrapT]),(U===s.TEXTURE_3D||U===s.TEXTURE_2D_ARRAY)&&s.texParameteri(U,s.TEXTURE_WRAP_R,X[C.wrapR]),s.texParameteri(U,s.TEXTURE_MAG_FILTER,q[C.magFilter]),s.texParameteri(U,s.TEXTURE_MIN_FILTER,q[C.minFilter]),C.compareFunction&&(s.texParameteri(U,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(U,s.TEXTURE_COMPARE_FUNC,I[C.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(C.magFilter===yi||C.minFilter!==Ml&&C.minFilter!==us||C.type===Ki&&e.has("OES_texture_float_linear")===!1)return;if(C.anisotropy>1||r.get(C).__currentAnisotropy){const se=e.get("EXT_texture_filter_anisotropic");s.texParameterf(U,se.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(C.anisotropy,a.getMaxAnisotropy())),r.get(C).__currentAnisotropy=C.anisotropy}}}function be(U,C){let se=!1;U.__webglInit===void 0&&(U.__webglInit=!0,C.addEventListener("dispose",D));const me=C.source;let ve=v.get(me);ve===void 0&&(ve={},v.set(me,ve));const he=oe(C);if(he!==U.__cacheKey){ve[he]===void 0&&(ve[he]={texture:s.createTexture(),usedTimes:0},u.memory.textures++,se=!0),ve[he].usedTimes++;const je=ve[U.__cacheKey];je!==void 0&&(ve[U.__cacheKey].usedTimes--,je.usedTimes===0&&P(C)),U.__cacheKey=he,U.__webglTexture=ve[he].texture}return se}function ne(U,C,se){let me=s.TEXTURE_2D;(C.isDataArrayTexture||C.isCompressedArrayTexture)&&(me=s.TEXTURE_2D_ARRAY),C.isData3DTexture&&(me=s.TEXTURE_3D);const ve=be(U,C),he=C.source;t.bindTexture(me,U.__webglTexture,s.TEXTURE0+se);const je=r.get(he);if(he.version!==je.__version||ve===!0){t.activeTexture(s.TEXTURE0+se);const Re=Tt.getPrimaries(Tt.workingColorSpace),ke=C.colorSpace===Pr?null:Tt.getPrimaries(C.colorSpace),pt=C.colorSpace===Pr||Re===ke?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,C.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,C.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,C.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,pt);let Me=b(C.image,!1,a.maxTextureSize);Me=Pt(C,Me);const ze=l.convert(C.format,C.colorSpace),tt=l.convert(C.type);let it=N(C.internalFormat,ze,tt,C.colorSpace,C.isVideoTexture);ie(me,C);let Be;const vt=C.mipmaps,at=C.isVideoTexture!==!0,Rt=je.__version===void 0||ve===!0,$=he.dataReady,Pe=O(C,Me);if(C.isDepthTexture)it=w(C.format===po,C.type),Rt&&(at?t.texStorage2D(s.TEXTURE_2D,1,it,Me.width,Me.height):t.texImage2D(s.TEXTURE_2D,0,it,Me.width,Me.height,0,ze,tt,null));else if(C.isDataTexture)if(vt.length>0){at&&Rt&&t.texStorage2D(s.TEXTURE_2D,Pe,it,vt[0].width,vt[0].height);for(let de=0,pe=vt.length;de<pe;de++)Be=vt[de],at?$&&t.texSubImage2D(s.TEXTURE_2D,de,0,0,Be.width,Be.height,ze,tt,Be.data):t.texImage2D(s.TEXTURE_2D,de,it,Be.width,Be.height,0,ze,tt,Be.data);C.generateMipmaps=!1}else at?(Rt&&t.texStorage2D(s.TEXTURE_2D,Pe,it,Me.width,Me.height),$&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,Me.width,Me.height,ze,tt,Me.data)):t.texImage2D(s.TEXTURE_2D,0,it,Me.width,Me.height,0,ze,tt,Me.data);else if(C.isCompressedTexture)if(C.isCompressedArrayTexture){at&&Rt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,Pe,it,vt[0].width,vt[0].height,Me.depth);for(let de=0,pe=vt.length;de<pe;de++)if(Be=vt[de],C.format!==_i)if(ze!==null)if(at){if($)if(C.layerUpdates.size>0){const De=v0(Be.width,Be.height,C.format,C.type);for(const Le of C.layerUpdates){const lt=Be.data.subarray(Le*De/Be.data.BYTES_PER_ELEMENT,(Le+1)*De/Be.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,de,0,0,Le,Be.width,Be.height,1,ze,lt)}C.clearLayerUpdates()}else t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,de,0,0,0,Be.width,Be.height,Me.depth,ze,Be.data)}else t.compressedTexImage3D(s.TEXTURE_2D_ARRAY,de,it,Be.width,Be.height,Me.depth,0,Be.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else at?$&&t.texSubImage3D(s.TEXTURE_2D_ARRAY,de,0,0,0,Be.width,Be.height,Me.depth,ze,tt,Be.data):t.texImage3D(s.TEXTURE_2D_ARRAY,de,it,Be.width,Be.height,Me.depth,0,ze,tt,Be.data)}else{at&&Rt&&t.texStorage2D(s.TEXTURE_2D,Pe,it,vt[0].width,vt[0].height);for(let de=0,pe=vt.length;de<pe;de++)Be=vt[de],C.format!==_i?ze!==null?at?$&&t.compressedTexSubImage2D(s.TEXTURE_2D,de,0,0,Be.width,Be.height,ze,Be.data):t.compressedTexImage2D(s.TEXTURE_2D,de,it,Be.width,Be.height,0,Be.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):at?$&&t.texSubImage2D(s.TEXTURE_2D,de,0,0,Be.width,Be.height,ze,tt,Be.data):t.texImage2D(s.TEXTURE_2D,de,it,Be.width,Be.height,0,ze,tt,Be.data)}else if(C.isDataArrayTexture)if(at){if(Rt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,Pe,it,Me.width,Me.height,Me.depth),$)if(C.layerUpdates.size>0){const de=v0(Me.width,Me.height,C.format,C.type);for(const pe of C.layerUpdates){const De=Me.data.subarray(pe*de/Me.data.BYTES_PER_ELEMENT,(pe+1)*de/Me.data.BYTES_PER_ELEMENT);t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,pe,Me.width,Me.height,1,ze,tt,De)}C.clearLayerUpdates()}else t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,Me.width,Me.height,Me.depth,ze,tt,Me.data)}else t.texImage3D(s.TEXTURE_2D_ARRAY,0,it,Me.width,Me.height,Me.depth,0,ze,tt,Me.data);else if(C.isData3DTexture)at?(Rt&&t.texStorage3D(s.TEXTURE_3D,Pe,it,Me.width,Me.height,Me.depth),$&&t.texSubImage3D(s.TEXTURE_3D,0,0,0,0,Me.width,Me.height,Me.depth,ze,tt,Me.data)):t.texImage3D(s.TEXTURE_3D,0,it,Me.width,Me.height,Me.depth,0,ze,tt,Me.data);else if(C.isFramebufferTexture){if(Rt)if(at)t.texStorage2D(s.TEXTURE_2D,Pe,it,Me.width,Me.height);else{let de=Me.width,pe=Me.height;for(let De=0;De<Pe;De++)t.texImage2D(s.TEXTURE_2D,De,it,de,pe,0,ze,tt,null),de>>=1,pe>>=1}}else if(vt.length>0){if(at&&Rt){const de=qe(vt[0]);t.texStorage2D(s.TEXTURE_2D,Pe,it,de.width,de.height)}for(let de=0,pe=vt.length;de<pe;de++)Be=vt[de],at?$&&t.texSubImage2D(s.TEXTURE_2D,de,0,0,ze,tt,Be):t.texImage2D(s.TEXTURE_2D,de,it,ze,tt,Be);C.generateMipmaps=!1}else if(at){if(Rt){const de=qe(Me);t.texStorage2D(s.TEXTURE_2D,Pe,it,de.width,de.height)}$&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,ze,tt,Me)}else t.texImage2D(s.TEXTURE_2D,0,it,ze,tt,Me);y(C)&&x(me),je.__version=he.version,C.onUpdate&&C.onUpdate(C)}U.__version=C.version}function fe(U,C,se){if(C.image.length!==6)return;const me=be(U,C),ve=C.source;t.bindTexture(s.TEXTURE_CUBE_MAP,U.__webglTexture,s.TEXTURE0+se);const he=r.get(ve);if(ve.version!==he.__version||me===!0){t.activeTexture(s.TEXTURE0+se);const je=Tt.getPrimaries(Tt.workingColorSpace),Re=C.colorSpace===Pr?null:Tt.getPrimaries(C.colorSpace),ke=C.colorSpace===Pr||je===Re?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,C.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,C.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,C.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,ke);const pt=C.isCompressedTexture||C.image[0].isCompressedTexture,Me=C.image[0]&&C.image[0].isDataTexture,ze=[];for(let pe=0;pe<6;pe++)!pt&&!Me?ze[pe]=b(C.image[pe],!0,a.maxCubemapSize):ze[pe]=Me?C.image[pe].image:C.image[pe],ze[pe]=Pt(C,ze[pe]);const tt=ze[0],it=l.convert(C.format,C.colorSpace),Be=l.convert(C.type),vt=N(C.internalFormat,it,Be,C.colorSpace),at=C.isVideoTexture!==!0,Rt=he.__version===void 0||me===!0,$=ve.dataReady;let Pe=O(C,tt);ie(s.TEXTURE_CUBE_MAP,C);let de;if(pt){at&&Rt&&t.texStorage2D(s.TEXTURE_CUBE_MAP,Pe,vt,tt.width,tt.height);for(let pe=0;pe<6;pe++){de=ze[pe].mipmaps;for(let De=0;De<de.length;De++){const Le=de[De];C.format!==_i?it!==null?at?$&&t.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De,0,0,Le.width,Le.height,it,Le.data):t.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De,vt,Le.width,Le.height,0,Le.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):at?$&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De,0,0,Le.width,Le.height,it,Be,Le.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De,vt,Le.width,Le.height,0,it,Be,Le.data)}}}else{if(de=C.mipmaps,at&&Rt){de.length>0&&Pe++;const pe=qe(ze[0]);t.texStorage2D(s.TEXTURE_CUBE_MAP,Pe,vt,pe.width,pe.height)}for(let pe=0;pe<6;pe++)if(Me){at?$&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,0,0,ze[pe].width,ze[pe].height,it,Be,ze[pe].data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,vt,ze[pe].width,ze[pe].height,0,it,Be,ze[pe].data);for(let De=0;De<de.length;De++){const lt=de[De].image[pe].image;at?$&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De+1,0,0,lt.width,lt.height,it,Be,lt.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De+1,vt,lt.width,lt.height,0,it,Be,lt.data)}}else{at?$&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,0,0,it,Be,ze[pe]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,0,vt,it,Be,ze[pe]);for(let De=0;De<de.length;De++){const Le=de[De];at?$&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De+1,0,0,it,Be,Le.image[pe]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+pe,De+1,vt,it,Be,Le.image[pe])}}}y(C)&&x(s.TEXTURE_CUBE_MAP),he.__version=ve.version,C.onUpdate&&C.onUpdate(C)}U.__version=C.version}function Se(U,C,se,me,ve,he){const je=l.convert(se.format,se.colorSpace),Re=l.convert(se.type),ke=N(se.internalFormat,je,Re,se.colorSpace),pt=r.get(C),Me=r.get(se);if(Me.__renderTarget=C,!pt.__hasExternalTextures){const ze=Math.max(1,C.width>>he),tt=Math.max(1,C.height>>he);ve===s.TEXTURE_3D||ve===s.TEXTURE_2D_ARRAY?t.texImage3D(ve,he,ke,ze,tt,C.depth,0,je,Re,null):t.texImage2D(ve,he,ke,ze,tt,0,je,Re,null)}t.bindFramebuffer(s.FRAMEBUFFER,U),xt(C)?d.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,me,ve,Me.__webglTexture,0,yt(C)):(ve===s.TEXTURE_2D||ve>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&ve<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,me,ve,Me.__webglTexture,he),t.bindFramebuffer(s.FRAMEBUFFER,null)}function xe(U,C,se){if(s.bindRenderbuffer(s.RENDERBUFFER,U),C.depthBuffer){const me=C.depthTexture,ve=me&&me.isDepthTexture?me.type:null,he=w(C.stencilBuffer,ve),je=C.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Re=yt(C);xt(C)?d.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,Re,he,C.width,C.height):se?s.renderbufferStorageMultisample(s.RENDERBUFFER,Re,he,C.width,C.height):s.renderbufferStorage(s.RENDERBUFFER,he,C.width,C.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,je,s.RENDERBUFFER,U)}else{const me=C.textures;for(let ve=0;ve<me.length;ve++){const he=me[ve],je=l.convert(he.format,he.colorSpace),Re=l.convert(he.type),ke=N(he.internalFormat,je,Re,he.colorSpace),pt=yt(C);se&&xt(C)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,pt,ke,C.width,C.height):xt(C)?d.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,pt,ke,C.width,C.height):s.renderbufferStorage(s.RENDERBUFFER,ke,C.width,C.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Ae(U,C){if(C&&C.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(s.FRAMEBUFFER,U),!(C.depthTexture&&C.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");const me=r.get(C.depthTexture);me.__renderTarget=C,(!me.__webglTexture||C.depthTexture.image.width!==C.width||C.depthTexture.image.height!==C.height)&&(C.depthTexture.image.width=C.width,C.depthTexture.image.height=C.height,C.depthTexture.needsUpdate=!0),ce(C.depthTexture,0);const ve=me.__webglTexture,he=yt(C);if(C.depthTexture.format===ao)xt(C)?d.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ve,0,he):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ve,0);else if(C.depthTexture.format===po)xt(C)?d.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ve,0,he):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ve,0);else throw new Error("Unknown depthTexture format")}function Ie(U){const C=r.get(U),se=U.isWebGLCubeRenderTarget===!0;if(C.__boundDepthTexture!==U.depthTexture){const me=U.depthTexture;if(C.__depthDisposeCallback&&C.__depthDisposeCallback(),me){const ve=()=>{delete C.__boundDepthTexture,delete C.__depthDisposeCallback,me.removeEventListener("dispose",ve)};me.addEventListener("dispose",ve),C.__depthDisposeCallback=ve}C.__boundDepthTexture=me}if(U.depthTexture&&!C.__autoAllocateDepthBuffer){if(se)throw new Error("target.depthTexture not supported in Cube render targets");Ae(C.__webglFramebuffer,U)}else if(se){C.__webglDepthbuffer=[];for(let me=0;me<6;me++)if(t.bindFramebuffer(s.FRAMEBUFFER,C.__webglFramebuffer[me]),C.__webglDepthbuffer[me]===void 0)C.__webglDepthbuffer[me]=s.createRenderbuffer(),xe(C.__webglDepthbuffer[me],U,!1);else{const ve=U.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,he=C.__webglDepthbuffer[me];s.bindRenderbuffer(s.RENDERBUFFER,he),s.framebufferRenderbuffer(s.FRAMEBUFFER,ve,s.RENDERBUFFER,he)}}else if(t.bindFramebuffer(s.FRAMEBUFFER,C.__webglFramebuffer),C.__webglDepthbuffer===void 0)C.__webglDepthbuffer=s.createRenderbuffer(),xe(C.__webglDepthbuffer,U,!1);else{const me=U.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ve=C.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,ve),s.framebufferRenderbuffer(s.FRAMEBUFFER,me,s.RENDERBUFFER,ve)}t.bindFramebuffer(s.FRAMEBUFFER,null)}function Ce(U,C,se){const me=r.get(U);C!==void 0&&Se(me.__webglFramebuffer,U,U.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),se!==void 0&&Ie(U)}function Ze(U){const C=U.texture,se=r.get(U),me=r.get(C);U.addEventListener("dispose",F);const ve=U.textures,he=U.isWebGLCubeRenderTarget===!0,je=ve.length>1;if(je||(me.__webglTexture===void 0&&(me.__webglTexture=s.createTexture()),me.__version=C.version,u.memory.textures++),he){se.__webglFramebuffer=[];for(let Re=0;Re<6;Re++)if(C.mipmaps&&C.mipmaps.length>0){se.__webglFramebuffer[Re]=[];for(let ke=0;ke<C.mipmaps.length;ke++)se.__webglFramebuffer[Re][ke]=s.createFramebuffer()}else se.__webglFramebuffer[Re]=s.createFramebuffer()}else{if(C.mipmaps&&C.mipmaps.length>0){se.__webglFramebuffer=[];for(let Re=0;Re<C.mipmaps.length;Re++)se.__webglFramebuffer[Re]=s.createFramebuffer()}else se.__webglFramebuffer=s.createFramebuffer();if(je)for(let Re=0,ke=ve.length;Re<ke;Re++){const pt=r.get(ve[Re]);pt.__webglTexture===void 0&&(pt.__webglTexture=s.createTexture(),u.memory.textures++)}if(U.samples>0&&xt(U)===!1){se.__webglMultisampledFramebuffer=s.createFramebuffer(),se.__webglColorRenderbuffer=[],t.bindFramebuffer(s.FRAMEBUFFER,se.__webglMultisampledFramebuffer);for(let Re=0;Re<ve.length;Re++){const ke=ve[Re];se.__webglColorRenderbuffer[Re]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,se.__webglColorRenderbuffer[Re]);const pt=l.convert(ke.format,ke.colorSpace),Me=l.convert(ke.type),ze=N(ke.internalFormat,pt,Me,ke.colorSpace,U.isXRRenderTarget===!0),tt=yt(U);s.renderbufferStorageMultisample(s.RENDERBUFFER,tt,ze,U.width,U.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+Re,s.RENDERBUFFER,se.__webglColorRenderbuffer[Re])}s.bindRenderbuffer(s.RENDERBUFFER,null),U.depthBuffer&&(se.__webglDepthRenderbuffer=s.createRenderbuffer(),xe(se.__webglDepthRenderbuffer,U,!0)),t.bindFramebuffer(s.FRAMEBUFFER,null)}}if(he){t.bindTexture(s.TEXTURE_CUBE_MAP,me.__webglTexture),ie(s.TEXTURE_CUBE_MAP,C);for(let Re=0;Re<6;Re++)if(C.mipmaps&&C.mipmaps.length>0)for(let ke=0;ke<C.mipmaps.length;ke++)Se(se.__webglFramebuffer[Re][ke],U,C,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,ke);else Se(se.__webglFramebuffer[Re],U,C,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+Re,0);y(C)&&x(s.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(je){for(let Re=0,ke=ve.length;Re<ke;Re++){const pt=ve[Re],Me=r.get(pt);t.bindTexture(s.TEXTURE_2D,Me.__webglTexture),ie(s.TEXTURE_2D,pt),Se(se.__webglFramebuffer,U,pt,s.COLOR_ATTACHMENT0+Re,s.TEXTURE_2D,0),y(pt)&&x(s.TEXTURE_2D)}t.unbindTexture()}else{let Re=s.TEXTURE_2D;if((U.isWebGL3DRenderTarget||U.isWebGLArrayRenderTarget)&&(Re=U.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(Re,me.__webglTexture),ie(Re,C),C.mipmaps&&C.mipmaps.length>0)for(let ke=0;ke<C.mipmaps.length;ke++)Se(se.__webglFramebuffer[ke],U,C,s.COLOR_ATTACHMENT0,Re,ke);else Se(se.__webglFramebuffer,U,C,s.COLOR_ATTACHMENT0,Re,0);y(C)&&x(Re),t.unbindTexture()}U.depthBuffer&&Ie(U)}function Ke(U){const C=U.textures;for(let se=0,me=C.length;se<me;se++){const ve=C[se];if(y(ve)){const he=L(U),je=r.get(ve).__webglTexture;t.bindTexture(he,je),x(he),t.unbindTexture()}}}const gt=[],Y=[];function dn(U){if(U.samples>0){if(xt(U)===!1){const C=U.textures,se=U.width,me=U.height;let ve=s.COLOR_BUFFER_BIT;const he=U.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,je=r.get(U),Re=C.length>1;if(Re)for(let ke=0;ke<C.length;ke++)t.bindFramebuffer(s.FRAMEBUFFER,je.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ke,s.RENDERBUFFER,null),t.bindFramebuffer(s.FRAMEBUFFER,je.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+ke,s.TEXTURE_2D,null,0);t.bindFramebuffer(s.READ_FRAMEBUFFER,je.__webglMultisampledFramebuffer),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,je.__webglFramebuffer);for(let ke=0;ke<C.length;ke++){if(U.resolveDepthBuffer&&(U.depthBuffer&&(ve|=s.DEPTH_BUFFER_BIT),U.stencilBuffer&&U.resolveStencilBuffer&&(ve|=s.STENCIL_BUFFER_BIT)),Re){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,je.__webglColorRenderbuffer[ke]);const pt=r.get(C[ke]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,pt,0)}s.blitFramebuffer(0,0,se,me,0,0,se,me,ve,s.NEAREST),h===!0&&(gt.length=0,Y.length=0,gt.push(s.COLOR_ATTACHMENT0+ke),U.depthBuffer&&U.resolveDepthBuffer===!1&&(gt.push(he),Y.push(he),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,Y)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,gt))}if(t.bindFramebuffer(s.READ_FRAMEBUFFER,null),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),Re)for(let ke=0;ke<C.length;ke++){t.bindFramebuffer(s.FRAMEBUFFER,je.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+ke,s.RENDERBUFFER,je.__webglColorRenderbuffer[ke]);const pt=r.get(C[ke]).__webglTexture;t.bindFramebuffer(s.FRAMEBUFFER,je.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+ke,s.TEXTURE_2D,pt,0)}t.bindFramebuffer(s.DRAW_FRAMEBUFFER,je.__webglMultisampledFramebuffer)}else if(U.depthBuffer&&U.resolveDepthBuffer===!1&&h){const C=U.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[C])}}}function yt(U){return Math.min(a.maxSamples,U.samples)}function xt(U){const C=r.get(U);return U.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&C.__useRenderToTexture!==!1}function Qe(U){const C=u.render.frame;g.get(U)!==C&&(g.set(U,C),U.update())}function Pt(U,C){const se=U.colorSpace,me=U.format,ve=U.type;return U.isCompressedTexture===!0||U.isVideoTexture===!0||se!==go&&se!==Pr&&(Tt.getTransfer(se)===Lt?(me!==_i||ve!==er)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",se)),C}function qe(U){return typeof HTMLImageElement<"u"&&U instanceof HTMLImageElement?(m.width=U.naturalWidth||U.width,m.height=U.naturalHeight||U.height):typeof VideoFrame<"u"&&U instanceof VideoFrame?(m.width=U.displayWidth,m.height=U.displayHeight):(m.width=U.width,m.height=U.height),m}this.allocateTextureUnit=J,this.resetTextureUnits=te,this.setTexture2D=ce,this.setTexture2DArray=j,this.setTexture3D=Q,this.setTextureCube=z,this.rebindTextures=Ce,this.setupRenderTarget=Ze,this.updateRenderTargetMipmap=Ke,this.updateMultisampleRenderTarget=dn,this.setupDepthRenderbuffer=Ie,this.setupFrameBufferTexture=Se,this.useMultisampledRTT=xt}function Uw(s,e){function t(r,a=Pr){let l;const u=Tt.getTransfer(a);if(r===er)return s.UNSIGNED_BYTE;if(r===Uf)return s.UNSIGNED_SHORT_4_4_4_4;if(r===Ff)return s.UNSIGNED_SHORT_5_5_5_1;if(r===Vg)return s.UNSIGNED_INT_5_9_9_9_REV;if(r===Bg)return s.BYTE;if(r===Hg)return s.SHORT;if(r===da)return s.UNSIGNED_SHORT;if(r===If)return s.INT;if(r===ds)return s.UNSIGNED_INT;if(r===Ki)return s.FLOAT;if(r===ha)return s.HALF_FLOAT;if(r===Gg)return s.ALPHA;if(r===jg)return s.RGB;if(r===_i)return s.RGBA;if(r===Wg)return s.LUMINANCE;if(r===Xg)return s.LUMINANCE_ALPHA;if(r===ao)return s.DEPTH_COMPONENT;if(r===po)return s.DEPTH_STENCIL;if(r===$g)return s.RED;if(r===kf)return s.RED_INTEGER;if(r===Yg)return s.RG;if(r===Of)return s.RG_INTEGER;if(r===zf)return s.RGBA_INTEGER;if(r===Kl||r===Ql||r===Jl||r===ec)if(u===Lt)if(l=e.get("WEBGL_compressed_texture_s3tc_srgb"),l!==null){if(r===Kl)return l.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(r===Ql)return l.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(r===Jl)return l.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(r===ec)return l.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(l=e.get("WEBGL_compressed_texture_s3tc"),l!==null){if(r===Kl)return l.COMPRESSED_RGB_S3TC_DXT1_EXT;if(r===Ql)return l.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(r===Jl)return l.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(r===ec)return l.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(r===Jd||r===ef||r===tf||r===nf)if(l=e.get("WEBGL_compressed_texture_pvrtc"),l!==null){if(r===Jd)return l.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(r===ef)return l.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(r===tf)return l.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(r===nf)return l.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(r===rf||r===sf||r===of)if(l=e.get("WEBGL_compressed_texture_etc"),l!==null){if(r===rf||r===sf)return u===Lt?l.COMPRESSED_SRGB8_ETC2:l.COMPRESSED_RGB8_ETC2;if(r===of)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:l.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(r===af||r===lf||r===cf||r===uf||r===df||r===ff||r===hf||r===pf||r===mf||r===gf||r===xf||r===vf||r===_f||r===yf)if(l=e.get("WEBGL_compressed_texture_astc"),l!==null){if(r===af)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:l.COMPRESSED_RGBA_ASTC_4x4_KHR;if(r===lf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:l.COMPRESSED_RGBA_ASTC_5x4_KHR;if(r===cf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:l.COMPRESSED_RGBA_ASTC_5x5_KHR;if(r===uf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:l.COMPRESSED_RGBA_ASTC_6x5_KHR;if(r===df)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:l.COMPRESSED_RGBA_ASTC_6x6_KHR;if(r===ff)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:l.COMPRESSED_RGBA_ASTC_8x5_KHR;if(r===hf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:l.COMPRESSED_RGBA_ASTC_8x6_KHR;if(r===pf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:l.COMPRESSED_RGBA_ASTC_8x8_KHR;if(r===mf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:l.COMPRESSED_RGBA_ASTC_10x5_KHR;if(r===gf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:l.COMPRESSED_RGBA_ASTC_10x6_KHR;if(r===xf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:l.COMPRESSED_RGBA_ASTC_10x8_KHR;if(r===vf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:l.COMPRESSED_RGBA_ASTC_10x10_KHR;if(r===_f)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:l.COMPRESSED_RGBA_ASTC_12x10_KHR;if(r===yf)return u===Lt?l.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:l.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(r===tc||r===Sf||r===Mf)if(l=e.get("EXT_texture_compression_bptc"),l!==null){if(r===tc)return u===Lt?l.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:l.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(r===Sf)return l.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(r===Mf)return l.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(r===qg||r===Ef||r===wf||r===Tf)if(l=e.get("EXT_texture_compression_rgtc"),l!==null){if(r===tc)return l.COMPRESSED_RED_RGTC1_EXT;if(r===Ef)return l.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(r===wf)return l.COMPRESSED_RED_GREEN_RGTC2_EXT;if(r===Tf)return l.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return r===ho?s.UNSIGNED_INT_24_8:s[r]!==void 0?s[r]:null}return{convert:t}}class Fw extends si{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e}}class la extends Kt{constructor(){super(),this.isGroup=!0,this.type="Group"}}const kw={type:"move"};class Pd{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new la,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new la,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new V,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new V),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new la,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new V,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new V),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){const t=this._hand;if(t)for(const r of e.hand.values())this._getHandJoint(t,r)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,r){let a=null,l=null,u=null;const d=this._targetRay,h=this._grip,m=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(m&&e.hand){u=!0;for(const b of e.hand.values()){const y=t.getJointPose(b,r),x=this._getHandJoint(m,b);y!==null&&(x.matrix.fromArray(y.transform.matrix),x.matrix.decompose(x.position,x.rotation,x.scale),x.matrixWorldNeedsUpdate=!0,x.jointRadius=y.radius),x.visible=y!==null}const g=m.joints["index-finger-tip"],_=m.joints["thumb-tip"],v=g.position.distanceTo(_.position),M=.02,T=.005;m.inputState.pinching&&v>M+T?(m.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!m.inputState.pinching&&v<=M-T&&(m.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else h!==null&&e.gripSpace&&(l=t.getPose(e.gripSpace,r),l!==null&&(h.matrix.fromArray(l.transform.matrix),h.matrix.decompose(h.position,h.rotation,h.scale),h.matrixWorldNeedsUpdate=!0,l.linearVelocity?(h.hasLinearVelocity=!0,h.linearVelocity.copy(l.linearVelocity)):h.hasLinearVelocity=!1,l.angularVelocity?(h.hasAngularVelocity=!0,h.angularVelocity.copy(l.angularVelocity)):h.hasAngularVelocity=!1));d!==null&&(a=t.getPose(e.targetRaySpace,r),a===null&&l!==null&&(a=l),a!==null&&(d.matrix.fromArray(a.transform.matrix),d.matrix.decompose(d.position,d.rotation,d.scale),d.matrixWorldNeedsUpdate=!0,a.linearVelocity?(d.hasLinearVelocity=!0,d.linearVelocity.copy(a.linearVelocity)):d.hasLinearVelocity=!1,a.angularVelocity?(d.hasAngularVelocity=!0,d.angularVelocity.copy(a.angularVelocity)):d.hasAngularVelocity=!1,this.dispatchEvent(kw)))}return d!==null&&(d.visible=a!==null),h!==null&&(h.visible=l!==null),m!==null&&(m.visible=u!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){const r=new la;r.matrixAutoUpdate=!1,r.visible=!1,e.joints[t.jointName]=r,e.add(r)}return e.joints[t.jointName]}}const Ow=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,zw=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class Bw{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t,r){if(this.texture===null){const a=new Dn,l=e.properties.get(a);l.__webglTexture=t.texture,(t.depthNear!=r.depthNear||t.depthFar!=r.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=a}}getMesh(e){if(this.texture!==null&&this.mesh===null){const t=e.cameras[0].viewport,r=new tr({vertexShader:Ow,fragmentShader:zw,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new Fe(new ma(20,20),r)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class Hw extends hs{constructor(e,t){super();const r=this;let a=null,l=1,u=null,d="local-floor",h=1,m=null,g=null,_=null,v=null,M=null,T=null;const b=new Bw,y=t.getContextAttributes();let x=null,L=null;const N=[],w=[],O=new ut;let D=null;const F=new si;F.viewport=new qt;const B=new si;B.viewport=new qt;const P=[F,B],A=new Fw;let H=null,te=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(ne){let fe=N[ne];return fe===void 0&&(fe=new Pd,N[ne]=fe),fe.getTargetRaySpace()},this.getControllerGrip=function(ne){let fe=N[ne];return fe===void 0&&(fe=new Pd,N[ne]=fe),fe.getGripSpace()},this.getHand=function(ne){let fe=N[ne];return fe===void 0&&(fe=new Pd,N[ne]=fe),fe.getHandSpace()};function J(ne){const fe=w.indexOf(ne.inputSource);if(fe===-1)return;const Se=N[fe];Se!==void 0&&(Se.update(ne.inputSource,ne.frame,m||u),Se.dispatchEvent({type:ne.type,data:ne.inputSource}))}function oe(){a.removeEventListener("select",J),a.removeEventListener("selectstart",J),a.removeEventListener("selectend",J),a.removeEventListener("squeeze",J),a.removeEventListener("squeezestart",J),a.removeEventListener("squeezeend",J),a.removeEventListener("end",oe),a.removeEventListener("inputsourceschange",ce);for(let ne=0;ne<N.length;ne++){const fe=w[ne];fe!==null&&(w[ne]=null,N[ne].disconnect(fe))}H=null,te=null,b.reset(),e.setRenderTarget(x),M=null,v=null,_=null,a=null,L=null,be.stop(),r.isPresenting=!1,e.setPixelRatio(D),e.setSize(O.width,O.height,!1),r.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(ne){l=ne,r.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(ne){d=ne,r.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return m||u},this.setReferenceSpace=function(ne){m=ne},this.getBaseLayer=function(){return v!==null?v:M},this.getBinding=function(){return _},this.getFrame=function(){return T},this.getSession=function(){return a},this.setSession=async function(ne){if(a=ne,a!==null){if(x=e.getRenderTarget(),a.addEventListener("select",J),a.addEventListener("selectstart",J),a.addEventListener("selectend",J),a.addEventListener("squeeze",J),a.addEventListener("squeezestart",J),a.addEventListener("squeezeend",J),a.addEventListener("end",oe),a.addEventListener("inputsourceschange",ce),y.xrCompatible!==!0&&await t.makeXRCompatible(),D=e.getPixelRatio(),e.getSize(O),a.renderState.layers===void 0){const fe={antialias:y.antialias,alpha:!0,depth:y.depth,stencil:y.stencil,framebufferScaleFactor:l};M=new XRWebGLLayer(a,t,fe),a.updateRenderState({baseLayer:M}),e.setPixelRatio(1),e.setSize(M.framebufferWidth,M.framebufferHeight,!1),L=new fs(M.framebufferWidth,M.framebufferHeight,{format:_i,type:er,colorSpace:e.outputColorSpace,stencilBuffer:y.stencil})}else{let fe=null,Se=null,xe=null;y.depth&&(xe=y.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,fe=y.stencil?po:ao,Se=y.stencil?ho:ds);const Ae={colorFormat:t.RGBA8,depthFormat:xe,scaleFactor:l};_=new XRWebGLBinding(a,t),v=_.createProjectionLayer(Ae),a.updateRenderState({layers:[v]}),e.setPixelRatio(1),e.setSize(v.textureWidth,v.textureHeight,!1),L=new fs(v.textureWidth,v.textureHeight,{format:_i,type:er,depthTexture:new cx(v.textureWidth,v.textureHeight,Se,void 0,void 0,void 0,void 0,void 0,void 0,fe),stencilBuffer:y.stencil,colorSpace:e.outputColorSpace,samples:y.antialias?4:0,resolveDepthBuffer:v.ignoreDepthValues===!1})}L.isXRRenderTarget=!0,this.setFoveation(h),m=null,u=await a.requestReferenceSpace(d),be.setContext(a),be.start(),r.isPresenting=!0,r.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(a!==null)return a.environmentBlendMode},this.getDepthTexture=function(){return b.getDepthTexture()};function ce(ne){for(let fe=0;fe<ne.removed.length;fe++){const Se=ne.removed[fe],xe=w.indexOf(Se);xe>=0&&(w[xe]=null,N[xe].disconnect(Se))}for(let fe=0;fe<ne.added.length;fe++){const Se=ne.added[fe];let xe=w.indexOf(Se);if(xe===-1){for(let Ie=0;Ie<N.length;Ie++)if(Ie>=w.length){w.push(Se),xe=Ie;break}else if(w[Ie]===null){w[Ie]=Se,xe=Ie;break}if(xe===-1)break}const Ae=N[xe];Ae&&Ae.connect(Se)}}const j=new V,Q=new V;function z(ne,fe,Se){j.setFromMatrixPosition(fe.matrixWorld),Q.setFromMatrixPosition(Se.matrixWorld);const xe=j.distanceTo(Q),Ae=fe.projectionMatrix.elements,Ie=Se.projectionMatrix.elements,Ce=Ae[14]/(Ae[10]-1),Ze=Ae[14]/(Ae[10]+1),Ke=(Ae[9]+1)/Ae[5],gt=(Ae[9]-1)/Ae[5],Y=(Ae[8]-1)/Ae[0],dn=(Ie[8]+1)/Ie[0],yt=Ce*Y,xt=Ce*dn,Qe=xe/(-Y+dn),Pt=Qe*-Y;if(fe.matrixWorld.decompose(ne.position,ne.quaternion,ne.scale),ne.translateX(Pt),ne.translateZ(Qe),ne.matrixWorld.compose(ne.position,ne.quaternion,ne.scale),ne.matrixWorldInverse.copy(ne.matrixWorld).invert(),Ae[10]===-1)ne.projectionMatrix.copy(fe.projectionMatrix),ne.projectionMatrixInverse.copy(fe.projectionMatrixInverse);else{const qe=Ce+Qe,U=Ze+Qe,C=yt-Pt,se=xt+(xe-Pt),me=Ke*Ze/U*qe,ve=gt*Ze/U*qe;ne.projectionMatrix.makePerspective(C,se,me,ve,qe,U),ne.projectionMatrixInverse.copy(ne.projectionMatrix).invert()}}function X(ne,fe){fe===null?ne.matrixWorld.copy(ne.matrix):ne.matrixWorld.multiplyMatrices(fe.matrixWorld,ne.matrix),ne.matrixWorldInverse.copy(ne.matrixWorld).invert()}this.updateCamera=function(ne){if(a===null)return;let fe=ne.near,Se=ne.far;b.texture!==null&&(b.depthNear>0&&(fe=b.depthNear),b.depthFar>0&&(Se=b.depthFar)),A.near=B.near=F.near=fe,A.far=B.far=F.far=Se,(H!==A.near||te!==A.far)&&(a.updateRenderState({depthNear:A.near,depthFar:A.far}),H=A.near,te=A.far),F.layers.mask=ne.layers.mask|2,B.layers.mask=ne.layers.mask|4,A.layers.mask=F.layers.mask|B.layers.mask;const xe=ne.parent,Ae=A.cameras;X(A,xe);for(let Ie=0;Ie<Ae.length;Ie++)X(Ae[Ie],xe);Ae.length===2?z(A,F,B):A.projectionMatrix.copy(F.projectionMatrix),q(ne,A,xe)};function q(ne,fe,Se){Se===null?ne.matrix.copy(fe.matrixWorld):(ne.matrix.copy(Se.matrixWorld),ne.matrix.invert(),ne.matrix.multiply(fe.matrixWorld)),ne.matrix.decompose(ne.position,ne.quaternion,ne.scale),ne.updateMatrixWorld(!0),ne.projectionMatrix.copy(fe.projectionMatrix),ne.projectionMatrixInverse.copy(fe.projectionMatrixInverse),ne.isPerspectiveCamera&&(ne.fov=Af*2*Math.atan(1/ne.projectionMatrix.elements[5]),ne.zoom=1)}this.getCamera=function(){return A},this.getFoveation=function(){if(!(v===null&&M===null))return h},this.setFoveation=function(ne){h=ne,v!==null&&(v.fixedFoveation=ne),M!==null&&M.fixedFoveation!==void 0&&(M.fixedFoveation=ne)},this.hasDepthSensing=function(){return b.texture!==null},this.getDepthSensingMesh=function(){return b.getMesh(A)};let I=null;function ie(ne,fe){if(g=fe.getViewerPose(m||u),T=fe,g!==null){const Se=g.views;M!==null&&(e.setRenderTargetFramebuffer(L,M.framebuffer),e.setRenderTarget(L));let xe=!1;Se.length!==A.cameras.length&&(A.cameras.length=0,xe=!0);for(let Ie=0;Ie<Se.length;Ie++){const Ce=Se[Ie];let Ze=null;if(M!==null)Ze=M.getViewport(Ce);else{const gt=_.getViewSubImage(v,Ce);Ze=gt.viewport,Ie===0&&(e.setRenderTargetTextures(L,gt.colorTexture,v.ignoreDepthValues?void 0:gt.depthStencilTexture),e.setRenderTarget(L))}let Ke=P[Ie];Ke===void 0&&(Ke=new si,Ke.layers.enable(Ie),Ke.viewport=new qt,P[Ie]=Ke),Ke.matrix.fromArray(Ce.transform.matrix),Ke.matrix.decompose(Ke.position,Ke.quaternion,Ke.scale),Ke.projectionMatrix.fromArray(Ce.projectionMatrix),Ke.projectionMatrixInverse.copy(Ke.projectionMatrix).invert(),Ke.viewport.set(Ze.x,Ze.y,Ze.width,Ze.height),Ie===0&&(A.matrix.copy(Ke.matrix),A.matrix.decompose(A.position,A.quaternion,A.scale)),xe===!0&&A.cameras.push(Ke)}const Ae=a.enabledFeatures;if(Ae&&Ae.includes("depth-sensing")){const Ie=_.getDepthInformation(Se[0]);Ie&&Ie.isValid&&Ie.texture&&b.init(e,Ie,a.renderState)}}for(let Se=0;Se<N.length;Se++){const xe=w[Se],Ae=N[Se];xe!==null&&Ae!==void 0&&Ae.update(xe,fe,m||u)}I&&I(ne,fe),fe.detectedPlanes&&r.dispatchEvent({type:"planesdetected",data:fe}),T=null}const be=new ax;be.setAnimationLoop(ie),this.setAnimationLoop=function(ne){I=ne},this.dispose=function(){}}}const ns=new Mi,Vw=new Ft;function Gw(s,e){function t(y,x){y.matrixAutoUpdate===!0&&y.updateMatrix(),x.value.copy(y.matrix)}function r(y,x){x.color.getRGB(y.fogColor.value,rx(s)),x.isFog?(y.fogNear.value=x.near,y.fogFar.value=x.far):x.isFogExp2&&(y.fogDensity.value=x.density)}function a(y,x,L,N,w){x.isMeshBasicMaterial||x.isMeshLambertMaterial?l(y,x):x.isMeshToonMaterial?(l(y,x),_(y,x)):x.isMeshPhongMaterial?(l(y,x),g(y,x)):x.isMeshStandardMaterial?(l(y,x),v(y,x),x.isMeshPhysicalMaterial&&M(y,x,w)):x.isMeshMatcapMaterial?(l(y,x),T(y,x)):x.isMeshDepthMaterial?l(y,x):x.isMeshDistanceMaterial?(l(y,x),b(y,x)):x.isMeshNormalMaterial?l(y,x):x.isLineBasicMaterial?(u(y,x),x.isLineDashedMaterial&&d(y,x)):x.isPointsMaterial?h(y,x,L,N):x.isSpriteMaterial?m(y,x):x.isShadowMaterial?(y.color.value.copy(x.color),y.opacity.value=x.opacity):x.isShaderMaterial&&(x.uniformsNeedUpdate=!1)}function l(y,x){y.opacity.value=x.opacity,x.color&&y.diffuse.value.copy(x.color),x.emissive&&y.emissive.value.copy(x.emissive).multiplyScalar(x.emissiveIntensity),x.map&&(y.map.value=x.map,t(x.map,y.mapTransform)),x.alphaMap&&(y.alphaMap.value=x.alphaMap,t(x.alphaMap,y.alphaMapTransform)),x.bumpMap&&(y.bumpMap.value=x.bumpMap,t(x.bumpMap,y.bumpMapTransform),y.bumpScale.value=x.bumpScale,x.side===Ln&&(y.bumpScale.value*=-1)),x.normalMap&&(y.normalMap.value=x.normalMap,t(x.normalMap,y.normalMapTransform),y.normalScale.value.copy(x.normalScale),x.side===Ln&&y.normalScale.value.negate()),x.displacementMap&&(y.displacementMap.value=x.displacementMap,t(x.displacementMap,y.displacementMapTransform),y.displacementScale.value=x.displacementScale,y.displacementBias.value=x.displacementBias),x.emissiveMap&&(y.emissiveMap.value=x.emissiveMap,t(x.emissiveMap,y.emissiveMapTransform)),x.specularMap&&(y.specularMap.value=x.specularMap,t(x.specularMap,y.specularMapTransform)),x.alphaTest>0&&(y.alphaTest.value=x.alphaTest);const L=e.get(x),N=L.envMap,w=L.envMapRotation;N&&(y.envMap.value=N,ns.copy(w),ns.x*=-1,ns.y*=-1,ns.z*=-1,N.isCubeTexture&&N.isRenderTargetTexture===!1&&(ns.y*=-1,ns.z*=-1),y.envMapRotation.value.setFromMatrix4(Vw.makeRotationFromEuler(ns)),y.flipEnvMap.value=N.isCubeTexture&&N.isRenderTargetTexture===!1?-1:1,y.reflectivity.value=x.reflectivity,y.ior.value=x.ior,y.refractionRatio.value=x.refractionRatio),x.lightMap&&(y.lightMap.value=x.lightMap,y.lightMapIntensity.value=x.lightMapIntensity,t(x.lightMap,y.lightMapTransform)),x.aoMap&&(y.aoMap.value=x.aoMap,y.aoMapIntensity.value=x.aoMapIntensity,t(x.aoMap,y.aoMapTransform))}function u(y,x){y.diffuse.value.copy(x.color),y.opacity.value=x.opacity,x.map&&(y.map.value=x.map,t(x.map,y.mapTransform))}function d(y,x){y.dashSize.value=x.dashSize,y.totalSize.value=x.dashSize+x.gapSize,y.scale.value=x.scale}function h(y,x,L,N){y.diffuse.value.copy(x.color),y.opacity.value=x.opacity,y.size.value=x.size*L,y.scale.value=N*.5,x.map&&(y.map.value=x.map,t(x.map,y.uvTransform)),x.alphaMap&&(y.alphaMap.value=x.alphaMap,t(x.alphaMap,y.alphaMapTransform)),x.alphaTest>0&&(y.alphaTest.value=x.alphaTest)}function m(y,x){y.diffuse.value.copy(x.color),y.opacity.value=x.opacity,y.rotation.value=x.rotation,x.map&&(y.map.value=x.map,t(x.map,y.mapTransform)),x.alphaMap&&(y.alphaMap.value=x.alphaMap,t(x.alphaMap,y.alphaMapTransform)),x.alphaTest>0&&(y.alphaTest.value=x.alphaTest)}function g(y,x){y.specular.value.copy(x.specular),y.shininess.value=Math.max(x.shininess,1e-4)}function _(y,x){x.gradientMap&&(y.gradientMap.value=x.gradientMap)}function v(y,x){y.metalness.value=x.metalness,x.metalnessMap&&(y.metalnessMap.value=x.metalnessMap,t(x.metalnessMap,y.metalnessMapTransform)),y.roughness.value=x.roughness,x.roughnessMap&&(y.roughnessMap.value=x.roughnessMap,t(x.roughnessMap,y.roughnessMapTransform)),x.envMap&&(y.envMapIntensity.value=x.envMapIntensity)}function M(y,x,L){y.ior.value=x.ior,x.sheen>0&&(y.sheenColor.value.copy(x.sheenColor).multiplyScalar(x.sheen),y.sheenRoughness.value=x.sheenRoughness,x.sheenColorMap&&(y.sheenColorMap.value=x.sheenColorMap,t(x.sheenColorMap,y.sheenColorMapTransform)),x.sheenRoughnessMap&&(y.sheenRoughnessMap.value=x.sheenRoughnessMap,t(x.sheenRoughnessMap,y.sheenRoughnessMapTransform))),x.clearcoat>0&&(y.clearcoat.value=x.clearcoat,y.clearcoatRoughness.value=x.clearcoatRoughness,x.clearcoatMap&&(y.clearcoatMap.value=x.clearcoatMap,t(x.clearcoatMap,y.clearcoatMapTransform)),x.clearcoatRoughnessMap&&(y.clearcoatRoughnessMap.value=x.clearcoatRoughnessMap,t(x.clearcoatRoughnessMap,y.clearcoatRoughnessMapTransform)),x.clearcoatNormalMap&&(y.clearcoatNormalMap.value=x.clearcoatNormalMap,t(x.clearcoatNormalMap,y.clearcoatNormalMapTransform),y.clearcoatNormalScale.value.copy(x.clearcoatNormalScale),x.side===Ln&&y.clearcoatNormalScale.value.negate())),x.dispersion>0&&(y.dispersion.value=x.dispersion),x.iridescence>0&&(y.iridescence.value=x.iridescence,y.iridescenceIOR.value=x.iridescenceIOR,y.iridescenceThicknessMinimum.value=x.iridescenceThicknessRange[0],y.iridescenceThicknessMaximum.value=x.iridescenceThicknessRange[1],x.iridescenceMap&&(y.iridescenceMap.value=x.iridescenceMap,t(x.iridescenceMap,y.iridescenceMapTransform)),x.iridescenceThicknessMap&&(y.iridescenceThicknessMap.value=x.iridescenceThicknessMap,t(x.iridescenceThicknessMap,y.iridescenceThicknessMapTransform))),x.transmission>0&&(y.transmission.value=x.transmission,y.transmissionSamplerMap.value=L.texture,y.transmissionSamplerSize.value.set(L.width,L.height),x.transmissionMap&&(y.transmissionMap.value=x.transmissionMap,t(x.transmissionMap,y.transmissionMapTransform)),y.thickness.value=x.thickness,x.thicknessMap&&(y.thicknessMap.value=x.thicknessMap,t(x.thicknessMap,y.thicknessMapTransform)),y.attenuationDistance.value=x.attenuationDistance,y.attenuationColor.value.copy(x.attenuationColor)),x.anisotropy>0&&(y.anisotropyVector.value.set(x.anisotropy*Math.cos(x.anisotropyRotation),x.anisotropy*Math.sin(x.anisotropyRotation)),x.anisotropyMap&&(y.anisotropyMap.value=x.anisotropyMap,t(x.anisotropyMap,y.anisotropyMapTransform))),y.specularIntensity.value=x.specularIntensity,y.specularColor.value.copy(x.specularColor),x.specularColorMap&&(y.specularColorMap.value=x.specularColorMap,t(x.specularColorMap,y.specularColorMapTransform)),x.specularIntensityMap&&(y.specularIntensityMap.value=x.specularIntensityMap,t(x.specularIntensityMap,y.specularIntensityMapTransform))}function T(y,x){x.matcap&&(y.matcap.value=x.matcap)}function b(y,x){const L=e.get(x).light;y.referencePosition.value.setFromMatrixPosition(L.matrixWorld),y.nearDistance.value=L.shadow.camera.near,y.farDistance.value=L.shadow.camera.far}return{refreshFogUniforms:r,refreshMaterialUniforms:a}}function jw(s,e,t,r){let a={},l={},u=[];const d=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function h(L,N){const w=N.program;r.uniformBlockBinding(L,w)}function m(L,N){let w=a[L.id];w===void 0&&(T(L),w=g(L),a[L.id]=w,L.addEventListener("dispose",y));const O=N.program;r.updateUBOMapping(L,O);const D=e.render.frame;l[L.id]!==D&&(v(L),l[L.id]=D)}function g(L){const N=_();L.__bindingPointIndex=N;const w=s.createBuffer(),O=L.__size,D=L.usage;return s.bindBuffer(s.UNIFORM_BUFFER,w),s.bufferData(s.UNIFORM_BUFFER,O,D),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,N,w),w}function _(){for(let L=0;L<d;L++)if(u.indexOf(L)===-1)return u.push(L),L;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function v(L){const N=a[L.id],w=L.uniforms,O=L.__cache;s.bindBuffer(s.UNIFORM_BUFFER,N);for(let D=0,F=w.length;D<F;D++){const B=Array.isArray(w[D])?w[D]:[w[D]];for(let P=0,A=B.length;P<A;P++){const H=B[P];if(M(H,D,P,O)===!0){const te=H.__offset,J=Array.isArray(H.value)?H.value:[H.value];let oe=0;for(let ce=0;ce<J.length;ce++){const j=J[ce],Q=b(j);typeof j=="number"||typeof j=="boolean"?(H.__data[0]=j,s.bufferSubData(s.UNIFORM_BUFFER,te+oe,H.__data)):j.isMatrix3?(H.__data[0]=j.elements[0],H.__data[1]=j.elements[1],H.__data[2]=j.elements[2],H.__data[3]=0,H.__data[4]=j.elements[3],H.__data[5]=j.elements[4],H.__data[6]=j.elements[5],H.__data[7]=0,H.__data[8]=j.elements[6],H.__data[9]=j.elements[7],H.__data[10]=j.elements[8],H.__data[11]=0):(j.toArray(H.__data,oe),oe+=Q.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,te,H.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function M(L,N,w,O){const D=L.value,F=N+"_"+w;if(O[F]===void 0)return typeof D=="number"||typeof D=="boolean"?O[F]=D:O[F]=D.clone(),!0;{const B=O[F];if(typeof D=="number"||typeof D=="boolean"){if(B!==D)return O[F]=D,!0}else if(B.equals(D)===!1)return B.copy(D),!0}return!1}function T(L){const N=L.uniforms;let w=0;const O=16;for(let F=0,B=N.length;F<B;F++){const P=Array.isArray(N[F])?N[F]:[N[F]];for(let A=0,H=P.length;A<H;A++){const te=P[A],J=Array.isArray(te.value)?te.value:[te.value];for(let oe=0,ce=J.length;oe<ce;oe++){const j=J[oe],Q=b(j),z=w%O,X=z%Q.boundary,q=z+X;w+=X,q!==0&&O-q<Q.storage&&(w+=O-q),te.__data=new Float32Array(Q.storage/Float32Array.BYTES_PER_ELEMENT),te.__offset=w,w+=Q.storage}}}const D=w%O;return D>0&&(w+=O-D),L.__size=w,L.__cache={},this}function b(L){const N={boundary:0,storage:0};return typeof L=="number"||typeof L=="boolean"?(N.boundary=4,N.storage=4):L.isVector2?(N.boundary=8,N.storage=8):L.isVector3||L.isColor?(N.boundary=16,N.storage=12):L.isVector4?(N.boundary=16,N.storage=16):L.isMatrix3?(N.boundary=48,N.storage=48):L.isMatrix4?(N.boundary=64,N.storage=64):L.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",L),N}function y(L){const N=L.target;N.removeEventListener("dispose",y);const w=u.indexOf(N.__bindingPointIndex);u.splice(w,1),s.deleteBuffer(a[N.id]),delete a[N.id],delete l[N.id]}function x(){for(const L in a)s.deleteBuffer(a[L]);u=[],a={},l={}}return{bind:h,update:m,dispose:x}}class _0{constructor(e={}){const{canvas:t=Dy(),context:r=null,depth:a=!0,stencil:l=!1,alpha:u=!1,antialias:d=!1,premultipliedAlpha:h=!0,preserveDrawingBuffer:m=!1,powerPreference:g="default",failIfMajorPerformanceCaveat:_=!1,reverseDepthBuffer:v=!1}=e;this.isWebGLRenderer=!0;let M;if(r!==null){if(typeof WebGLRenderingContext<"u"&&r instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");M=r.getContextAttributes().alpha}else M=u;const T=new Uint32Array(4),b=new Int32Array(4);let y=null,x=null;const L=[],N=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=ri,this.toneMapping=Dr,this.toneMappingExposure=1;const w=this;let O=!1,D=0,F=0,B=null,P=-1,A=null;const H=new qt,te=new qt;let J=null;const oe=new mt(0);let ce=0,j=t.width,Q=t.height,z=1,X=null,q=null;const I=new qt(0,0,j,Q),ie=new qt(0,0,j,Q);let be=!1;const ne=new Vf;let fe=!1,Se=!1;const xe=new Ft,Ae=new Ft,Ie=new V,Ce=new qt,Ze={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Ke=!1;function gt(){return B===null?z:1}let Y=r;function dn(R,Z){return t.getContext(R,Z)}try{const R={alpha:!0,depth:a,stencil:l,antialias:d,premultipliedAlpha:h,preserveDrawingBuffer:m,powerPreference:g,failIfMajorPerformanceCaveat:_};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${Df}`),t.addEventListener("webglcontextlost",pe,!1),t.addEventListener("webglcontextrestored",De,!1),t.addEventListener("webglcontextcreationerror",Le,!1),Y===null){const Z="webgl2";if(Y=dn(Z,R),Y===null)throw dn(Z)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(R){throw console.error("THREE.WebGLRenderer: "+R.message),R}let yt,xt,Qe,Pt,qe,U,C,se,me,ve,he,je,Re,ke,pt,Me,ze,tt,it,Be,vt,at,Rt,$;function Pe(){yt=new ZM(Y),yt.init(),at=new Uw(Y,yt),xt=new jM(Y,yt,e,at),Qe=new Lw(Y,yt),xt.reverseDepthBuffer&&v&&Qe.buffers.depth.setReversed(!0),Pt=new JM(Y),qe=new xw,U=new Iw(Y,yt,Qe,qe,xt,at,Pt),C=new XM(w),se=new qM(w),me=new oS(Y),Rt=new VM(Y,me),ve=new KM(Y,me,Pt,Rt),he=new tE(Y,ve,me,Pt),it=new eE(Y,xt,U),Me=new WM(qe),je=new gw(w,C,se,yt,xt,Rt,Me),Re=new Gw(w,qe),ke=new _w,pt=new Tw(yt),tt=new HM(w,C,se,Qe,he,M,h),ze=new Pw(w,he,xt),$=new jw(Y,Pt,xt,Qe),Be=new GM(Y,yt,Pt),vt=new QM(Y,yt,Pt),Pt.programs=je.programs,w.capabilities=xt,w.extensions=yt,w.properties=qe,w.renderLists=ke,w.shadowMap=ze,w.state=Qe,w.info=Pt}Pe();const de=new Hw(w,Y);this.xr=de,this.getContext=function(){return Y},this.getContextAttributes=function(){return Y.getContextAttributes()},this.forceContextLoss=function(){const R=yt.get("WEBGL_lose_context");R&&R.loseContext()},this.forceContextRestore=function(){const R=yt.get("WEBGL_lose_context");R&&R.restoreContext()},this.getPixelRatio=function(){return z},this.setPixelRatio=function(R){R!==void 0&&(z=R,this.setSize(j,Q,!1))},this.getSize=function(R){return R.set(j,Q)},this.setSize=function(R,Z,le=!0){if(de.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}j=R,Q=Z,t.width=Math.floor(R*z),t.height=Math.floor(Z*z),le===!0&&(t.style.width=R+"px",t.style.height=Z+"px"),this.setViewport(0,0,R,Z)},this.getDrawingBufferSize=function(R){return R.set(j*z,Q*z).floor()},this.setDrawingBufferSize=function(R,Z,le){j=R,Q=Z,z=le,t.width=Math.floor(R*le),t.height=Math.floor(Z*le),this.setViewport(0,0,R,Z)},this.getCurrentViewport=function(R){return R.copy(H)},this.getViewport=function(R){return R.copy(I)},this.setViewport=function(R,Z,le,ue){R.isVector4?I.set(R.x,R.y,R.z,R.w):I.set(R,Z,le,ue),Qe.viewport(H.copy(I).multiplyScalar(z).round())},this.getScissor=function(R){return R.copy(ie)},this.setScissor=function(R,Z,le,ue){R.isVector4?ie.set(R.x,R.y,R.z,R.w):ie.set(R,Z,le,ue),Qe.scissor(te.copy(ie).multiplyScalar(z).round())},this.getScissorTest=function(){return be},this.setScissorTest=function(R){Qe.setScissorTest(be=R)},this.setOpaqueSort=function(R){X=R},this.setTransparentSort=function(R){q=R},this.getClearColor=function(R){return R.copy(tt.getClearColor())},this.setClearColor=function(){tt.setClearColor.apply(tt,arguments)},this.getClearAlpha=function(){return tt.getClearAlpha()},this.setClearAlpha=function(){tt.setClearAlpha.apply(tt,arguments)},this.clear=function(R=!0,Z=!0,le=!0){let ue=0;if(R){let K=!1;if(B!==null){const Te=B.texture.format;K=Te===zf||Te===Of||Te===kf}if(K){const Te=B.texture.type,Ee=Te===er||Te===ds||Te===da||Te===ho||Te===Uf||Te===Ff,We=tt.getClearColor(),Ve=tt.getClearAlpha(),rt=We.r,ot=We.g,Xe=We.b;Ee?(T[0]=rt,T[1]=ot,T[2]=Xe,T[3]=Ve,Y.clearBufferuiv(Y.COLOR,0,T)):(b[0]=rt,b[1]=ot,b[2]=Xe,b[3]=Ve,Y.clearBufferiv(Y.COLOR,0,b))}else ue|=Y.COLOR_BUFFER_BIT}Z&&(ue|=Y.DEPTH_BUFFER_BIT),le&&(ue|=Y.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),Y.clear(ue)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",pe,!1),t.removeEventListener("webglcontextrestored",De,!1),t.removeEventListener("webglcontextcreationerror",Le,!1),ke.dispose(),pt.dispose(),qe.dispose(),C.dispose(),se.dispose(),he.dispose(),Rt.dispose(),$.dispose(),je.dispose(),de.dispose(),de.removeEventListener("sessionstart",ms),de.removeEventListener("sessionend",nr),Di.stop()};function pe(R){R.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),O=!0}function De(){console.log("THREE.WebGLRenderer: Context Restored."),O=!1;const R=Pt.autoReset,Z=ze.enabled,le=ze.autoUpdate,ue=ze.needsUpdate,K=ze.type;Pe(),Pt.autoReset=R,ze.enabled=Z,ze.autoUpdate=le,ze.needsUpdate=ue,ze.type=K}function Le(R){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",R.statusMessage)}function lt(R){const Z=R.target;Z.removeEventListener("dispose",lt),Ot(Z)}function Ot(R){en(R),qe.remove(R)}function en(R){const Z=qe.get(R).programs;Z!==void 0&&(Z.forEach(function(le){je.releaseProgram(le)}),R.isShaderMaterial&&je.releaseShaderCache(R))}this.renderBufferDirect=function(R,Z,le,ue,K,Te){Z===null&&(Z=Ze);const Ee=K.isMesh&&K.matrixWorld.determinant()<0,We=va(R,Z,le,ue,K);Qe.setMaterial(ue,Ee);let Ve=le.index,rt=1;if(ue.wireframe===!0){if(Ve=ve.getWireframeAttribute(le),Ve===void 0)return;rt=2}const ot=le.drawRange,Xe=le.attributes.position;let Mt=ot.start*rt,Ct=(ot.start+ot.count)*rt;Te!==null&&(Mt=Math.max(Mt,Te.start*rt),Ct=Math.min(Ct,(Te.start+Te.count)*rt)),Ve!==null?(Mt=Math.max(Mt,0),Ct=Math.min(Ct,Ve.count)):Xe!=null&&(Mt=Math.max(Mt,0),Ct=Math.min(Ct,Xe.count));const St=Ct-Mt;if(St<0||St===1/0)return;Rt.setup(K,ue,We,le,Ve);let mn,ct=Be;if(Ve!==null&&(mn=me.get(Ve),ct=vt,ct.setIndex(mn)),K.isMesh)ue.wireframe===!0?(Qe.setLineWidth(ue.wireframeLinewidth*gt()),ct.setMode(Y.LINES)):ct.setMode(Y.TRIANGLES);else if(K.isLine){let Ye=ue.linewidth;Ye===void 0&&(Ye=1),Qe.setLineWidth(Ye*gt()),K.isLineSegments?ct.setMode(Y.LINES):K.isLineLoop?ct.setMode(Y.LINE_LOOP):ct.setMode(Y.LINE_STRIP)}else K.isPoints?ct.setMode(Y.POINTS):K.isSprite&&ct.setMode(Y.TRIANGLES);if(K.isBatchedMesh)if(K._multiDrawInstances!==null)ct.renderMultiDrawInstances(K._multiDrawStarts,K._multiDrawCounts,K._multiDrawCount,K._multiDrawInstances);else if(yt.get("WEBGL_multi_draw"))ct.renderMultiDraw(K._multiDrawStarts,K._multiDrawCounts,K._multiDrawCount);else{const Ye=K._multiDrawStarts,ai=K._multiDrawCounts,bt=K._multiDrawCount,gn=Ve?me.get(Ve).bytesPerElement:1,li=qe.get(ue).currentProgram.getUniforms();for(let tn=0;tn<bt;tn++)li.setValue(Y,"_gl_DrawID",tn),ct.render(Ye[tn]/gn,ai[tn])}else if(K.isInstancedMesh)ct.renderInstances(Mt,St,K.count);else if(le.isInstancedBufferGeometry){const Ye=le._maxInstanceCount!==void 0?le._maxInstanceCount:1/0,ai=Math.min(le.instanceCount,Ye);ct.renderInstances(Mt,St,ai)}else ct.render(Mt,St)};function Et(R,Z,le){R.transparent===!0&&R.side===Ni&&R.forceSinglePass===!1?(R.side=Ln,R.needsUpdate=!0,gs(R,Z,le),R.side=Ur,R.needsUpdate=!0,gs(R,Z,le),R.side=Ni):gs(R,Z,le)}this.compile=function(R,Z,le=null){le===null&&(le=R),x=pt.get(le),x.init(Z),N.push(x),le.traverseVisible(function(K){K.isLight&&K.layers.test(Z.layers)&&(x.pushLight(K),K.castShadow&&x.pushShadow(K))}),R!==le&&R.traverseVisible(function(K){K.isLight&&K.layers.test(Z.layers)&&(x.pushLight(K),K.castShadow&&x.pushShadow(K))}),x.setupLights();const ue=new Set;return R.traverse(function(K){if(!(K.isMesh||K.isPoints||K.isLine||K.isSprite))return;const Te=K.material;if(Te)if(Array.isArray(Te))for(let Ee=0;Ee<Te.length;Ee++){const We=Te[Ee];Et(We,le,K),ue.add(We)}else Et(Te,le,K),ue.add(Te)}),N.pop(),x=null,ue},this.compileAsync=function(R,Z,le=null){const ue=this.compile(R,Z,le);return new Promise(K=>{function Te(){if(ue.forEach(function(Ee){qe.get(Ee).currentProgram.isReady()&&ue.delete(Ee)}),ue.size===0){K(R);return}setTimeout(Te,10)}yt.get("KHR_parallel_shader_compile")!==null?Te():setTimeout(Te,10)})};let In=null;function Tn(R){In&&In(R)}function ms(){Di.stop()}function nr(){Di.start()}const Di=new ax;Di.setAnimationLoop(Tn),typeof self<"u"&&Di.setContext(self),this.setAnimationLoop=function(R){In=R,de.setAnimationLoop(R),R===null?Di.stop():Di.start()},de.addEventListener("sessionstart",ms),de.addEventListener("sessionend",nr),this.render=function(R,Z){if(Z!==void 0&&Z.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(O===!0)return;if(R.matrixWorldAutoUpdate===!0&&R.updateMatrixWorld(),Z.parent===null&&Z.matrixWorldAutoUpdate===!0&&Z.updateMatrixWorld(),de.enabled===!0&&de.isPresenting===!0&&(de.cameraAutoUpdate===!0&&de.updateCamera(Z),Z=de.getCamera()),R.isScene===!0&&R.onBeforeRender(w,R,Z,B),x=pt.get(R,N.length),x.init(Z),N.push(x),Ae.multiplyMatrices(Z.projectionMatrix,Z.matrixWorldInverse),ne.setFromProjectionMatrix(Ae),Se=this.localClippingEnabled,fe=Me.init(this.clippingPlanes,Se),y=ke.get(R,L.length),y.init(),L.push(y),de.enabled===!0&&de.isPresenting===!0){const Te=w.xr.getDepthSensingMesh();Te!==null&&Ii(Te,Z,-1/0,w.sortObjects)}Ii(R,Z,0,w.sortObjects),y.finish(),w.sortObjects===!0&&y.sort(X,q),Ke=de.enabled===!1||de.isPresenting===!1||de.hasDepthSensing()===!1,Ke&&tt.addToRenderList(y,R),this.info.render.frame++,fe===!0&&Me.beginShadows();const le=x.state.shadowsArray;ze.render(le,R,Z),fe===!0&&Me.endShadows(),this.info.autoReset===!0&&this.info.reset();const ue=y.opaque,K=y.transmissive;if(x.setupLights(),Z.isArrayCamera){const Te=Z.cameras;if(K.length>0)for(let Ee=0,We=Te.length;Ee<We;Ee++){const Ve=Te[Ee];kr(ue,K,R,Ve)}Ke&&tt.render(R);for(let Ee=0,We=Te.length;Ee<We;Ee++){const Ve=Te[Ee];Fr(y,R,Ve,Ve.viewport)}}else K.length>0&&kr(ue,K,R,Z),Ke&&tt.render(R),Fr(y,R,Z);B!==null&&(U.updateMultisampleRenderTarget(B),U.updateRenderTargetMipmap(B)),R.isScene===!0&&R.onAfterRender(w,R,Z),Rt.resetDefaultState(),P=-1,A=null,N.pop(),N.length>0?(x=N[N.length-1],fe===!0&&Me.setGlobalState(w.clippingPlanes,x.state.camera)):x=null,L.pop(),L.length>0?y=L[L.length-1]:y=null};function Ii(R,Z,le,ue){if(R.visible===!1)return;if(R.layers.test(Z.layers)){if(R.isGroup)le=R.renderOrder;else if(R.isLOD)R.autoUpdate===!0&&R.update(Z);else if(R.isLight)x.pushLight(R),R.castShadow&&x.pushShadow(R);else if(R.isSprite){if(!R.frustumCulled||ne.intersectsSprite(R)){ue&&Ce.setFromMatrixPosition(R.matrixWorld).applyMatrix4(Ae);const Ee=he.update(R),We=R.material;We.visible&&y.push(R,Ee,We,le,Ce.z,null)}}else if((R.isMesh||R.isLine||R.isPoints)&&(!R.frustumCulled||ne.intersectsObject(R))){const Ee=he.update(R),We=R.material;if(ue&&(R.boundingSphere!==void 0?(R.boundingSphere===null&&R.computeBoundingSphere(),Ce.copy(R.boundingSphere.center)):(Ee.boundingSphere===null&&Ee.computeBoundingSphere(),Ce.copy(Ee.boundingSphere.center)),Ce.applyMatrix4(R.matrixWorld).applyMatrix4(Ae)),Array.isArray(We)){const Ve=Ee.groups;for(let rt=0,ot=Ve.length;rt<ot;rt++){const Xe=Ve[rt],Mt=We[Xe.materialIndex];Mt&&Mt.visible&&y.push(R,Ee,Mt,le,Ce.z,Xe)}}else We.visible&&y.push(R,Ee,We,le,Ce.z,null)}}const Te=R.children;for(let Ee=0,We=Te.length;Ee<We;Ee++)Ii(Te[Ee],Z,le,ue)}function Fr(R,Z,le,ue){const K=R.opaque,Te=R.transmissive,Ee=R.transparent;x.setupLightsView(le),fe===!0&&Me.setGlobalState(w.clippingPlanes,le),ue&&Qe.viewport(H.copy(ue)),K.length>0&&ir(K,Z,le),Te.length>0&&ir(Te,Z,le),Ee.length>0&&ir(Ee,Z,le),Qe.buffers.depth.setTest(!0),Qe.buffers.depth.setMask(!0),Qe.buffers.color.setMask(!0),Qe.setPolygonOffset(!1)}function kr(R,Z,le,ue){if((le.isScene===!0?le.overrideMaterial:null)!==null)return;x.state.transmissionRenderTarget[ue.id]===void 0&&(x.state.transmissionRenderTarget[ue.id]=new fs(1,1,{generateMipmaps:!0,type:yt.has("EXT_color_buffer_half_float")||yt.has("EXT_color_buffer_float")?ha:er,minFilter:us,samples:4,stencilBuffer:l,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Tt.workingColorSpace}));const Te=x.state.transmissionRenderTarget[ue.id],Ee=ue.viewport||H;Te.setSize(Ee.z,Ee.w);const We=w.getRenderTarget();w.setRenderTarget(Te),w.getClearColor(oe),ce=w.getClearAlpha(),ce<1&&w.setClearColor(16777215,.5),w.clear(),Ke&&tt.render(le);const Ve=w.toneMapping;w.toneMapping=Dr;const rt=ue.viewport;if(ue.viewport!==void 0&&(ue.viewport=void 0),x.setupLightsView(ue),fe===!0&&Me.setGlobalState(w.clippingPlanes,ue),ir(R,le,ue),U.updateMultisampleRenderTarget(Te),U.updateRenderTargetMipmap(Te),yt.has("WEBGL_multisampled_render_to_texture")===!1){let ot=!1;for(let Xe=0,Mt=Z.length;Xe<Mt;Xe++){const Ct=Z[Xe],St=Ct.object,mn=Ct.geometry,ct=Ct.material,Ye=Ct.group;if(ct.side===Ni&&St.layers.test(ue.layers)){const ai=ct.side;ct.side=Ln,ct.needsUpdate=!0,ga(St,le,ue,mn,ct,Ye),ct.side=ai,ct.needsUpdate=!0,ot=!0}}ot===!0&&(U.updateMultisampleRenderTarget(Te),U.updateRenderTargetMipmap(Te))}w.setRenderTarget(We),w.setClearColor(oe,ce),rt!==void 0&&(ue.viewport=rt),w.toneMapping=Ve}function ir(R,Z,le){const ue=Z.isScene===!0?Z.overrideMaterial:null;for(let K=0,Te=R.length;K<Te;K++){const Ee=R[K],We=Ee.object,Ve=Ee.geometry,rt=ue===null?Ee.material:ue,ot=Ee.group;We.layers.test(le.layers)&&ga(We,Z,le,Ve,rt,ot)}}function ga(R,Z,le,ue,K,Te){R.onBeforeRender(w,Z,le,ue,K,Te),R.modelViewMatrix.multiplyMatrices(le.matrixWorldInverse,R.matrixWorld),R.normalMatrix.getNormalMatrix(R.modelViewMatrix),K.onBeforeRender(w,Z,le,ue,R,Te),K.transparent===!0&&K.side===Ni&&K.forceSinglePass===!1?(K.side=Ln,K.needsUpdate=!0,w.renderBufferDirect(le,Z,ue,K,R,Te),K.side=Ur,K.needsUpdate=!0,w.renderBufferDirect(le,Z,ue,K,R,Te),K.side=Ni):w.renderBufferDirect(le,Z,ue,K,R,Te),R.onAfterRender(w,Z,le,ue,K,Te)}function gs(R,Z,le){Z.isScene!==!0&&(Z=Ze);const ue=qe.get(R),K=x.state.lights,Te=x.state.shadowsArray,Ee=K.state.version,We=je.getParameters(R,K.state,Te,Z,le),Ve=je.getProgramCacheKey(We);let rt=ue.programs;ue.environment=R.isMeshStandardMaterial?Z.environment:null,ue.fog=Z.fog,ue.envMap=(R.isMeshStandardMaterial?se:C).get(R.envMap||ue.environment),ue.envMapRotation=ue.environment!==null&&R.envMap===null?Z.environmentRotation:R.envMapRotation,rt===void 0&&(R.addEventListener("dispose",lt),rt=new Map,ue.programs=rt);let ot=rt.get(Ve);if(ot!==void 0){if(ue.currentProgram===ot&&ue.lightsStateVersion===Ee)return Ei(R,We),ot}else We.uniforms=je.getUniforms(R),R.onBeforeCompile(We,w),ot=je.acquireProgram(We,Ve),rt.set(Ve,ot),ue.uniforms=We.uniforms;const Xe=ue.uniforms;return(!R.isShaderMaterial&&!R.isRawShaderMaterial||R.clipping===!0)&&(Xe.clippingPlanes=Me.uniform),Ei(R,We),ue.needsLights=xc(R),ue.lightsStateVersion=Ee,ue.needsLights&&(Xe.ambientLightColor.value=K.state.ambient,Xe.lightProbe.value=K.state.probe,Xe.directionalLights.value=K.state.directional,Xe.directionalLightShadows.value=K.state.directionalShadow,Xe.spotLights.value=K.state.spot,Xe.spotLightShadows.value=K.state.spotShadow,Xe.rectAreaLights.value=K.state.rectArea,Xe.ltc_1.value=K.state.rectAreaLTC1,Xe.ltc_2.value=K.state.rectAreaLTC2,Xe.pointLights.value=K.state.point,Xe.pointLightShadows.value=K.state.pointShadow,Xe.hemisphereLights.value=K.state.hemi,Xe.directionalShadowMap.value=K.state.directionalShadowMap,Xe.directionalShadowMatrix.value=K.state.directionalShadowMatrix,Xe.spotShadowMap.value=K.state.spotShadowMap,Xe.spotLightMatrix.value=K.state.spotLightMatrix,Xe.spotLightMap.value=K.state.spotLightMap,Xe.pointShadowMap.value=K.state.pointShadowMap,Xe.pointShadowMatrix.value=K.state.pointShadowMatrix),ue.currentProgram=ot,ue.uniformsList=null,ot}function xa(R){if(R.uniformsList===null){const Z=R.currentProgram.getUniforms();R.uniformsList=nc.seqWithValue(Z.seq,R.uniforms)}return R.uniformsList}function Ei(R,Z){const le=qe.get(R);le.outputColorSpace=Z.outputColorSpace,le.batching=Z.batching,le.batchingColor=Z.batchingColor,le.instancing=Z.instancing,le.instancingColor=Z.instancingColor,le.instancingMorph=Z.instancingMorph,le.skinning=Z.skinning,le.morphTargets=Z.morphTargets,le.morphNormals=Z.morphNormals,le.morphColors=Z.morphColors,le.morphTargetsCount=Z.morphTargetsCount,le.numClippingPlanes=Z.numClippingPlanes,le.numIntersection=Z.numClipIntersection,le.vertexAlphas=Z.vertexAlphas,le.vertexTangents=Z.vertexTangents,le.toneMapping=Z.toneMapping}function va(R,Z,le,ue,K){Z.isScene!==!0&&(Z=Ze),U.resetTextureUnits();const Te=Z.fog,Ee=ue.isMeshStandardMaterial?Z.environment:null,We=B===null?w.outputColorSpace:B.isXRRenderTarget===!0?B.texture.colorSpace:go,Ve=(ue.isMeshStandardMaterial?se:C).get(ue.envMap||Ee),rt=ue.vertexColors===!0&&!!le.attributes.color&&le.attributes.color.itemSize===4,ot=!!le.attributes.tangent&&(!!ue.normalMap||ue.anisotropy>0),Xe=!!le.morphAttributes.position,Mt=!!le.morphAttributes.normal,Ct=!!le.morphAttributes.color;let St=Dr;ue.toneMapped&&(B===null||B.isXRRenderTarget===!0)&&(St=w.toneMapping);const mn=le.morphAttributes.position||le.morphAttributes.normal||le.morphAttributes.color,ct=mn!==void 0?mn.length:0,Ye=qe.get(ue),ai=x.state.lights;if(fe===!0&&(Se===!0||R!==A)){const bn=R===A&&ue.id===P;Me.setState(ue,R,bn)}let bt=!1;ue.version===Ye.__version?(Ye.needsLights&&Ye.lightsStateVersion!==ai.state.version||Ye.outputColorSpace!==We||K.isBatchedMesh&&Ye.batching===!1||!K.isBatchedMesh&&Ye.batching===!0||K.isBatchedMesh&&Ye.batchingColor===!0&&K.colorTexture===null||K.isBatchedMesh&&Ye.batchingColor===!1&&K.colorTexture!==null||K.isInstancedMesh&&Ye.instancing===!1||!K.isInstancedMesh&&Ye.instancing===!0||K.isSkinnedMesh&&Ye.skinning===!1||!K.isSkinnedMesh&&Ye.skinning===!0||K.isInstancedMesh&&Ye.instancingColor===!0&&K.instanceColor===null||K.isInstancedMesh&&Ye.instancingColor===!1&&K.instanceColor!==null||K.isInstancedMesh&&Ye.instancingMorph===!0&&K.morphTexture===null||K.isInstancedMesh&&Ye.instancingMorph===!1&&K.morphTexture!==null||Ye.envMap!==Ve||ue.fog===!0&&Ye.fog!==Te||Ye.numClippingPlanes!==void 0&&(Ye.numClippingPlanes!==Me.numPlanes||Ye.numIntersection!==Me.numIntersection)||Ye.vertexAlphas!==rt||Ye.vertexTangents!==ot||Ye.morphTargets!==Xe||Ye.morphNormals!==Mt||Ye.morphColors!==Ct||Ye.toneMapping!==St||Ye.morphTargetsCount!==ct)&&(bt=!0):(bt=!0,Ye.__version=ue.version);let gn=Ye.currentProgram;bt===!0&&(gn=gs(ue,Z,K));let li=!1,tn=!1,wi=!1;const It=gn.getUniforms(),qn=Ye.uniforms;if(Qe.useProgram(gn.program)&&(li=!0,tn=!0,wi=!0),ue.id!==P&&(P=ue.id,tn=!0),li||A!==R){Qe.buffers.depth.getReversed()?(xe.copy(R.projectionMatrix),Uy(xe),Fy(xe),It.setValue(Y,"projectionMatrix",xe)):It.setValue(Y,"projectionMatrix",R.projectionMatrix),It.setValue(Y,"viewMatrix",R.matrixWorldInverse);const Zn=It.map.cameraPosition;Zn!==void 0&&Zn.setValue(Y,Ie.setFromMatrixPosition(R.matrixWorld)),xt.logarithmicDepthBuffer&&It.setValue(Y,"logDepthBufFC",2/(Math.log(R.far+1)/Math.LN2)),(ue.isMeshPhongMaterial||ue.isMeshToonMaterial||ue.isMeshLambertMaterial||ue.isMeshBasicMaterial||ue.isMeshStandardMaterial||ue.isShaderMaterial)&&It.setValue(Y,"isOrthographic",R.isOrthographicCamera===!0),A!==R&&(A=R,tn=!0,wi=!0)}if(K.isSkinnedMesh){It.setOptional(Y,K,"bindMatrix"),It.setOptional(Y,K,"bindMatrixInverse");const bn=K.skeleton;bn&&(bn.boneTexture===null&&bn.computeBoneTexture(),It.setValue(Y,"boneTexture",bn.boneTexture,U))}K.isBatchedMesh&&(It.setOptional(Y,K,"batchingTexture"),It.setValue(Y,"batchingTexture",K._matricesTexture,U),It.setOptional(Y,K,"batchingIdTexture"),It.setValue(Y,"batchingIdTexture",K._indirectTexture,U),It.setOptional(Y,K,"batchingColorTexture"),K._colorsTexture!==null&&It.setValue(Y,"batchingColorTexture",K._colorsTexture,U));const Ui=le.morphAttributes;if((Ui.position!==void 0||Ui.normal!==void 0||Ui.color!==void 0)&&it.update(K,le,gn),(tn||Ye.receiveShadow!==K.receiveShadow)&&(Ye.receiveShadow=K.receiveShadow,It.setValue(Y,"receiveShadow",K.receiveShadow)),ue.isMeshGouraudMaterial&&ue.envMap!==null&&(qn.envMap.value=Ve,qn.flipEnvMap.value=Ve.isCubeTexture&&Ve.isRenderTargetTexture===!1?-1:1),ue.isMeshStandardMaterial&&ue.envMap===null&&Z.environment!==null&&(qn.envMapIntensity.value=Z.environmentIntensity),tn&&(It.setValue(Y,"toneMappingExposure",w.toneMappingExposure),Ye.needsLights&&_a(qn,wi),Te&&ue.fog===!0&&Re.refreshFogUniforms(qn,Te),Re.refreshMaterialUniforms(qn,ue,z,Q,x.state.transmissionRenderTarget[R.id]),nc.upload(Y,xa(Ye),qn,U)),ue.isShaderMaterial&&ue.uniformsNeedUpdate===!0&&(nc.upload(Y,xa(Ye),qn,U),ue.uniformsNeedUpdate=!1),ue.isSpriteMaterial&&It.setValue(Y,"center",K.center),It.setValue(Y,"modelViewMatrix",K.modelViewMatrix),It.setValue(Y,"normalMatrix",K.normalMatrix),It.setValue(Y,"modelMatrix",K.matrixWorld),ue.isShaderMaterial||ue.isRawShaderMaterial){const bn=ue.uniformsGroups;for(let Zn=0,Un=bn.length;Zn<Un;Zn++){const ya=bn[Zn];$.update(ya,gn),$.bind(ya,gn)}}return gn}function _a(R,Z){R.ambientLightColor.needsUpdate=Z,R.lightProbe.needsUpdate=Z,R.directionalLights.needsUpdate=Z,R.directionalLightShadows.needsUpdate=Z,R.pointLights.needsUpdate=Z,R.pointLightShadows.needsUpdate=Z,R.spotLights.needsUpdate=Z,R.spotLightShadows.needsUpdate=Z,R.rectAreaLights.needsUpdate=Z,R.hemisphereLights.needsUpdate=Z}function xc(R){return R.isMeshLambertMaterial||R.isMeshToonMaterial||R.isMeshPhongMaterial||R.isMeshStandardMaterial||R.isShadowMaterial||R.isShaderMaterial&&R.lights===!0}this.getActiveCubeFace=function(){return D},this.getActiveMipmapLevel=function(){return F},this.getRenderTarget=function(){return B},this.setRenderTargetTextures=function(R,Z,le){qe.get(R.texture).__webglTexture=Z,qe.get(R.depthTexture).__webglTexture=le;const ue=qe.get(R);ue.__hasExternalTextures=!0,ue.__autoAllocateDepthBuffer=le===void 0,ue.__autoAllocateDepthBuffer||yt.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),ue.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(R,Z){const le=qe.get(R);le.__webglFramebuffer=Z,le.__useDefaultFramebuffer=Z===void 0},this.setRenderTarget=function(R,Z=0,le=0){B=R,D=Z,F=le;let ue=!0,K=null,Te=!1,Ee=!1;if(R){const Ve=qe.get(R);if(Ve.__useDefaultFramebuffer!==void 0)Qe.bindFramebuffer(Y.FRAMEBUFFER,null),ue=!1;else if(Ve.__webglFramebuffer===void 0)U.setupRenderTarget(R);else if(Ve.__hasExternalTextures)U.rebindTextures(R,qe.get(R.texture).__webglTexture,qe.get(R.depthTexture).__webglTexture);else if(R.depthBuffer){const Xe=R.depthTexture;if(Ve.__boundDepthTexture!==Xe){if(Xe!==null&&qe.has(Xe)&&(R.width!==Xe.image.width||R.height!==Xe.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");U.setupDepthRenderbuffer(R)}}const rt=R.texture;(rt.isData3DTexture||rt.isDataArrayTexture||rt.isCompressedArrayTexture)&&(Ee=!0);const ot=qe.get(R).__webglFramebuffer;R.isWebGLCubeRenderTarget?(Array.isArray(ot[Z])?K=ot[Z][le]:K=ot[Z],Te=!0):R.samples>0&&U.useMultisampledRTT(R)===!1?K=qe.get(R).__webglMultisampledFramebuffer:Array.isArray(ot)?K=ot[le]:K=ot,H.copy(R.viewport),te.copy(R.scissor),J=R.scissorTest}else H.copy(I).multiplyScalar(z).floor(),te.copy(ie).multiplyScalar(z).floor(),J=be;if(Qe.bindFramebuffer(Y.FRAMEBUFFER,K)&&ue&&Qe.drawBuffers(R,K),Qe.viewport(H),Qe.scissor(te),Qe.setScissorTest(J),Te){const Ve=qe.get(R.texture);Y.framebufferTexture2D(Y.FRAMEBUFFER,Y.COLOR_ATTACHMENT0,Y.TEXTURE_CUBE_MAP_POSITIVE_X+Z,Ve.__webglTexture,le)}else if(Ee){const Ve=qe.get(R.texture),rt=Z||0;Y.framebufferTextureLayer(Y.FRAMEBUFFER,Y.COLOR_ATTACHMENT0,Ve.__webglTexture,le||0,rt)}P=-1},this.readRenderTargetPixels=function(R,Z,le,ue,K,Te,Ee){if(!(R&&R.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let We=qe.get(R).__webglFramebuffer;if(R.isWebGLCubeRenderTarget&&Ee!==void 0&&(We=We[Ee]),We){Qe.bindFramebuffer(Y.FRAMEBUFFER,We);try{const Ve=R.texture,rt=Ve.format,ot=Ve.type;if(!xt.textureFormatReadable(rt)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!xt.textureTypeReadable(ot)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}Z>=0&&Z<=R.width-ue&&le>=0&&le<=R.height-K&&Y.readPixels(Z,le,ue,K,at.convert(rt),at.convert(ot),Te)}finally{const Ve=B!==null?qe.get(B).__webglFramebuffer:null;Qe.bindFramebuffer(Y.FRAMEBUFFER,Ve)}}},this.readRenderTargetPixelsAsync=async function(R,Z,le,ue,K,Te,Ee){if(!(R&&R.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let We=qe.get(R).__webglFramebuffer;if(R.isWebGLCubeRenderTarget&&Ee!==void 0&&(We=We[Ee]),We){const Ve=R.texture,rt=Ve.format,ot=Ve.type;if(!xt.textureFormatReadable(rt))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!xt.textureTypeReadable(ot))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(Z>=0&&Z<=R.width-ue&&le>=0&&le<=R.height-K){Qe.bindFramebuffer(Y.FRAMEBUFFER,We);const Xe=Y.createBuffer();Y.bindBuffer(Y.PIXEL_PACK_BUFFER,Xe),Y.bufferData(Y.PIXEL_PACK_BUFFER,Te.byteLength,Y.STREAM_READ),Y.readPixels(Z,le,ue,K,at.convert(rt),at.convert(ot),0);const Mt=B!==null?qe.get(B).__webglFramebuffer:null;Qe.bindFramebuffer(Y.FRAMEBUFFER,Mt);const Ct=Y.fenceSync(Y.SYNC_GPU_COMMANDS_COMPLETE,0);return Y.flush(),await Iy(Y,Ct,4),Y.bindBuffer(Y.PIXEL_PACK_BUFFER,Xe),Y.getBufferSubData(Y.PIXEL_PACK_BUFFER,0,Te),Y.deleteBuffer(Xe),Y.deleteSync(Ct),Te}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(R,Z=null,le=0){R.isTexture!==!0&&(oa("WebGLRenderer: copyFramebufferToTexture function signature has changed."),Z=arguments[0]||null,R=arguments[1]);const ue=Math.pow(2,-le),K=Math.floor(R.image.width*ue),Te=Math.floor(R.image.height*ue),Ee=Z!==null?Z.x:0,We=Z!==null?Z.y:0;U.setTexture2D(R,0),Y.copyTexSubImage2D(Y.TEXTURE_2D,le,0,0,Ee,We,K,Te),Qe.unbindTexture()},this.copyTextureToTexture=function(R,Z,le=null,ue=null,K=0){R.isTexture!==!0&&(oa("WebGLRenderer: copyTextureToTexture function signature has changed."),ue=arguments[0]||null,R=arguments[1],Z=arguments[2],K=arguments[3]||0,le=null);let Te,Ee,We,Ve,rt,ot,Xe,Mt,Ct;const St=R.isCompressedTexture?R.mipmaps[K]:R.image;le!==null?(Te=le.max.x-le.min.x,Ee=le.max.y-le.min.y,We=le.isBox3?le.max.z-le.min.z:1,Ve=le.min.x,rt=le.min.y,ot=le.isBox3?le.min.z:0):(Te=St.width,Ee=St.height,We=St.depth||1,Ve=0,rt=0,ot=0),ue!==null?(Xe=ue.x,Mt=ue.y,Ct=ue.z):(Xe=0,Mt=0,Ct=0);const mn=at.convert(Z.format),ct=at.convert(Z.type);let Ye;Z.isData3DTexture?(U.setTexture3D(Z,0),Ye=Y.TEXTURE_3D):Z.isDataArrayTexture||Z.isCompressedArrayTexture?(U.setTexture2DArray(Z,0),Ye=Y.TEXTURE_2D_ARRAY):(U.setTexture2D(Z,0),Ye=Y.TEXTURE_2D),Y.pixelStorei(Y.UNPACK_FLIP_Y_WEBGL,Z.flipY),Y.pixelStorei(Y.UNPACK_PREMULTIPLY_ALPHA_WEBGL,Z.premultiplyAlpha),Y.pixelStorei(Y.UNPACK_ALIGNMENT,Z.unpackAlignment);const ai=Y.getParameter(Y.UNPACK_ROW_LENGTH),bt=Y.getParameter(Y.UNPACK_IMAGE_HEIGHT),gn=Y.getParameter(Y.UNPACK_SKIP_PIXELS),li=Y.getParameter(Y.UNPACK_SKIP_ROWS),tn=Y.getParameter(Y.UNPACK_SKIP_IMAGES);Y.pixelStorei(Y.UNPACK_ROW_LENGTH,St.width),Y.pixelStorei(Y.UNPACK_IMAGE_HEIGHT,St.height),Y.pixelStorei(Y.UNPACK_SKIP_PIXELS,Ve),Y.pixelStorei(Y.UNPACK_SKIP_ROWS,rt),Y.pixelStorei(Y.UNPACK_SKIP_IMAGES,ot);const wi=R.isDataArrayTexture||R.isData3DTexture,It=Z.isDataArrayTexture||Z.isData3DTexture;if(R.isRenderTargetTexture||R.isDepthTexture){const qn=qe.get(R),Ui=qe.get(Z),bn=qe.get(qn.__renderTarget),Zn=qe.get(Ui.__renderTarget);Qe.bindFramebuffer(Y.READ_FRAMEBUFFER,bn.__webglFramebuffer),Qe.bindFramebuffer(Y.DRAW_FRAMEBUFFER,Zn.__webglFramebuffer);for(let Un=0;Un<We;Un++)wi&&Y.framebufferTextureLayer(Y.READ_FRAMEBUFFER,Y.COLOR_ATTACHMENT0,qe.get(R).__webglTexture,K,ot+Un),R.isDepthTexture?(It&&Y.framebufferTextureLayer(Y.DRAW_FRAMEBUFFER,Y.COLOR_ATTACHMENT0,qe.get(Z).__webglTexture,K,Ct+Un),Y.blitFramebuffer(Ve,rt,Te,Ee,Xe,Mt,Te,Ee,Y.DEPTH_BUFFER_BIT,Y.NEAREST)):It?Y.copyTexSubImage3D(Ye,K,Xe,Mt,Ct+Un,Ve,rt,Te,Ee):Y.copyTexSubImage2D(Ye,K,Xe,Mt,Ct+Un,Ve,rt,Te,Ee);Qe.bindFramebuffer(Y.READ_FRAMEBUFFER,null),Qe.bindFramebuffer(Y.DRAW_FRAMEBUFFER,null)}else It?R.isDataTexture||R.isData3DTexture?Y.texSubImage3D(Ye,K,Xe,Mt,Ct,Te,Ee,We,mn,ct,St.data):Z.isCompressedArrayTexture?Y.compressedTexSubImage3D(Ye,K,Xe,Mt,Ct,Te,Ee,We,mn,St.data):Y.texSubImage3D(Ye,K,Xe,Mt,Ct,Te,Ee,We,mn,ct,St):R.isDataTexture?Y.texSubImage2D(Y.TEXTURE_2D,K,Xe,Mt,Te,Ee,mn,ct,St.data):R.isCompressedTexture?Y.compressedTexSubImage2D(Y.TEXTURE_2D,K,Xe,Mt,St.width,St.height,mn,St.data):Y.texSubImage2D(Y.TEXTURE_2D,K,Xe,Mt,Te,Ee,mn,ct,St);Y.pixelStorei(Y.UNPACK_ROW_LENGTH,ai),Y.pixelStorei(Y.UNPACK_IMAGE_HEIGHT,bt),Y.pixelStorei(Y.UNPACK_SKIP_PIXELS,gn),Y.pixelStorei(Y.UNPACK_SKIP_ROWS,li),Y.pixelStorei(Y.UNPACK_SKIP_IMAGES,tn),K===0&&Z.generateMipmaps&&Y.generateMipmap(Ye),Qe.unbindTexture()},this.copyTextureToTexture3D=function(R,Z,le=null,ue=null,K=0){return R.isTexture!==!0&&(oa("WebGLRenderer: copyTextureToTexture3D function signature has changed."),le=arguments[0]||null,ue=arguments[1]||null,R=arguments[2],Z=arguments[3],K=arguments[4]||0),oa('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(R,Z,le,ue,K)},this.initRenderTarget=function(R){qe.get(R).__webglFramebuffer===void 0&&U.setupRenderTarget(R)},this.initTexture=function(R){R.isCubeTexture?U.setTextureCube(R,0):R.isData3DTexture?U.setTexture3D(R,0):R.isDataArrayTexture||R.isCompressedArrayTexture?U.setTexture2DArray(R,0):U.setTexture2D(R,0),Qe.unbindTexture()},this.resetState=function(){D=0,F=0,B=null,Qe.reset(),Rt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return Qi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;const t=this.getContext();t.drawingBufferColorspace=Tt._getDrawingBufferColorSpace(e),t.unpackColorSpace=Tt._getUnpackColorSpace()}}class Ww extends Kt{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Mi,this.environmentIntensity=1,this.environmentRotation=new Mi,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){const t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}}class Xw{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=bf,this.updateRanges=[],this.version=0,this.uuid=Ir()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,r){e*=this.stride,r*=t.stride;for(let a=0,l=this.stride;a<l;a++)this.array[e+a]=t.array[r+a];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Ir()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);const t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),r=new this.constructor(t,this.stride);return r.setUsage(this.usage),r}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=Ir()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}}const Rn=new V;class ac{constructor(e,t,r,a=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=r,this.normalized=a}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,r=this.data.count;t<r;t++)Rn.fromBufferAttribute(this,t),Rn.applyMatrix4(e),this.setXYZ(t,Rn.x,Rn.y,Rn.z);return this}applyNormalMatrix(e){for(let t=0,r=this.count;t<r;t++)Rn.fromBufferAttribute(this,t),Rn.applyNormalMatrix(e),this.setXYZ(t,Rn.x,Rn.y,Rn.z);return this}transformDirection(e){for(let t=0,r=this.count;t<r;t++)Rn.fromBufferAttribute(this,t),Rn.transformDirection(e),this.setXYZ(t,Rn.x,Rn.y,Rn.z);return this}getComponent(e,t){let r=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(r=Li(r,this.array)),r}setComponent(e,t,r){return this.normalized&&(r=Dt(r,this.array)),this.data.array[e*this.data.stride+this.offset+t]=r,this}setX(e,t){return this.normalized&&(t=Dt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=Dt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=Dt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=Dt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Li(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Li(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Li(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Li(t,this.array)),t}setXY(e,t,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=r,this}setXYZ(e,t,r,a){return e=e*this.data.stride+this.offset,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array),a=Dt(a,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=r,this.data.array[e+2]=a,this}setXYZW(e,t,r,a,l){return e=e*this.data.stride+this.offset,this.normalized&&(t=Dt(t,this.array),r=Dt(r,this.array),a=Dt(a,this.array),l=Dt(l,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=r,this.data.array[e+2]=a,this.data.array[e+3]=l,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let r=0;r<this.count;r++){const a=r*this.data.stride+this.offset;for(let l=0;l<this.itemSize;l++)t.push(this.data.array[a+l])}return new Si(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new ac(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");const t=[];for(let r=0;r<this.count;r++){const a=r*this.data.stride+this.offset;for(let l=0;l<this.itemSize;l++)t.push(this.data.array[a+l])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}}class px extends ps{static get type(){return"SpriteMaterial"}constructor(e){super(),this.isSpriteMaterial=!0,this.color=new mt(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}}let Js;const ea=new V,eo=new V,to=new V,no=new ut,ta=new ut,mx=new Ft,Gl=new V,na=new V,jl=new V,y0=new ut,Nd=new ut,S0=new ut;class $w extends Kt{constructor(e=new px){if(super(),this.isSprite=!0,this.type="Sprite",Js===void 0){Js=new Xt;const t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),r=new Xw(t,5);Js.setIndex([0,1,2,0,2,3]),Js.setAttribute("position",new ac(r,3,0,!1)),Js.setAttribute("uv",new ac(r,2,3,!1))}this.geometry=Js,this.material=e,this.center=new ut(.5,.5)}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),eo.setFromMatrixScale(this.matrixWorld),mx.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),to.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&eo.multiplyScalar(-to.z);const r=this.material.rotation;let a,l;r!==0&&(l=Math.cos(r),a=Math.sin(r));const u=this.center;Wl(Gl.set(-.5,-.5,0),to,u,eo,a,l),Wl(na.set(.5,-.5,0),to,u,eo,a,l),Wl(jl.set(.5,.5,0),to,u,eo,a,l),y0.set(0,0),Nd.set(1,0),S0.set(1,1);let d=e.ray.intersectTriangle(Gl,na,jl,!1,ea);if(d===null&&(Wl(na.set(-.5,.5,0),to,u,eo,a,l),Nd.set(0,1),d=e.ray.intersectTriangle(Gl,jl,na,!1,ea),d===null))return;const h=e.ray.origin.distanceTo(ea);h<e.near||h>e.far||t.push({distance:h,point:ea.clone(),uv:oi.getInterpolation(ea,Gl,na,jl,y0,Nd,S0,new ut),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}}function Wl(s,e,t,r,a,l){no.subVectors(s,t).addScalar(.5).multiply(r),a!==void 0?(ta.x=l*no.x-a*no.y,ta.y=a*no.x+l*no.y):ta.copy(no),s.copy(e),s.x+=ta.x,s.y+=ta.y,s.applyMatrix4(mx)}class Zi extends ps{static get type(){return"LineBasicMaterial"}constructor(e){super(),this.isLineBasicMaterial=!0,this.color=new mt(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}}const lc=new V,cc=new V,M0=new Ft,ia=new Bf,Xl=new hc,Ld=new V,E0=new V;class wn extends Kt{constructor(e=new Xt,t=new Zi){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,r=[0];for(let a=1,l=t.count;a<l;a++)lc.fromBufferAttribute(t,a-1),cc.fromBufferAttribute(t,a),r[a]=r[a-1],r[a]+=lc.distanceTo(cc);e.setAttribute("lineDistance",new Ht(r,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){const r=this.geometry,a=this.matrixWorld,l=e.params.Line.threshold,u=r.drawRange;if(r.boundingSphere===null&&r.computeBoundingSphere(),Xl.copy(r.boundingSphere),Xl.applyMatrix4(a),Xl.radius+=l,e.ray.intersectsSphere(Xl)===!1)return;M0.copy(a).invert(),ia.copy(e.ray).applyMatrix4(M0);const d=l/((this.scale.x+this.scale.y+this.scale.z)/3),h=d*d,m=this.isLineSegments?2:1,g=r.index,v=r.attributes.position;if(g!==null){const M=Math.max(0,u.start),T=Math.min(g.count,u.start+u.count);for(let b=M,y=T-1;b<y;b+=m){const x=g.getX(b),L=g.getX(b+1),N=$l(this,e,ia,h,x,L);N&&t.push(N)}if(this.isLineLoop){const b=g.getX(T-1),y=g.getX(M),x=$l(this,e,ia,h,b,y);x&&t.push(x)}}else{const M=Math.max(0,u.start),T=Math.min(v.count,u.start+u.count);for(let b=M,y=T-1;b<y;b+=m){const x=$l(this,e,ia,h,b,b+1);x&&t.push(x)}if(this.isLineLoop){const b=$l(this,e,ia,h,T-1,M);b&&t.push(b)}}}updateMorphTargets(){const t=this.geometry.morphAttributes,r=Object.keys(t);if(r.length>0){const a=t[r[0]];if(a!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let l=0,u=a.length;l<u;l++){const d=a[l].name||String(l);this.morphTargetInfluences.push(0),this.morphTargetDictionary[d]=l}}}}}function $l(s,e,t,r,a,l){const u=s.geometry.attributes.position;if(lc.fromBufferAttribute(u,a),cc.fromBufferAttribute(u,l),t.distanceSqToSegment(lc,cc,Ld,E0)>r)return;Ld.applyMatrix4(s.matrixWorld);const h=e.ray.origin.distanceTo(Ld);if(!(h<e.near||h>e.far))return{distance:h,point:E0.clone().applyMatrix4(s.matrixWorld),index:a,face:null,faceIndex:null,barycoord:null,object:s}}const w0=new V,T0=new V;class Yw extends wn{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){const e=this.geometry;if(e.index===null){const t=e.attributes.position,r=[];for(let a=0,l=t.count;a<l;a+=2)w0.fromBufferAttribute(t,a),T0.fromBufferAttribute(t,a+1),r[a]=a===0?0:r[a-1],r[a+1]=r[a]+w0.distanceTo(T0);e.setAttribute("lineDistance",new Ht(r,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}}class qw extends Dn{constructor(e,t,r,a,l,u,d,h,m){super(e,t,r,a,l,u,d,h,m),this.isCanvasTexture=!0,this.needsUpdate=!0}}class pn extends Xt{constructor(e=1,t=1,r=1,a=32,l=1,u=!1,d=0,h=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:r,radialSegments:a,heightSegments:l,openEnded:u,thetaStart:d,thetaLength:h};const m=this;a=Math.floor(a),l=Math.floor(l);const g=[],_=[],v=[],M=[];let T=0;const b=[],y=r/2;let x=0;L(),u===!1&&(e>0&&N(!0),t>0&&N(!1)),this.setIndex(g),this.setAttribute("position",new Ht(_,3)),this.setAttribute("normal",new Ht(v,3)),this.setAttribute("uv",new Ht(M,2));function L(){const w=new V,O=new V;let D=0;const F=(t-e)/r;for(let B=0;B<=l;B++){const P=[],A=B/l,H=A*(t-e)+e;for(let te=0;te<=a;te++){const J=te/a,oe=J*h+d,ce=Math.sin(oe),j=Math.cos(oe);O.x=H*ce,O.y=-A*r+y,O.z=H*j,_.push(O.x,O.y,O.z),w.set(ce,F,j).normalize(),v.push(w.x,w.y,w.z),M.push(J,1-A),P.push(T++)}b.push(P)}for(let B=0;B<a;B++)for(let P=0;P<l;P++){const A=b[P][B],H=b[P+1][B],te=b[P+1][B+1],J=b[P][B+1];(e>0||P!==0)&&(g.push(A,H,J),D+=3),(t>0||P!==l-1)&&(g.push(H,te,J),D+=3)}m.addGroup(x,D,0),x+=D}function N(w){const O=T,D=new ut,F=new V;let B=0;const P=w===!0?e:t,A=w===!0?1:-1;for(let te=1;te<=a;te++)_.push(0,y*A,0),v.push(0,A,0),M.push(.5,.5),T++;const H=T;for(let te=0;te<=a;te++){const oe=te/a*h+d,ce=Math.cos(oe),j=Math.sin(oe);F.x=P*j,F.y=y*A,F.z=P*ce,_.push(F.x,F.y,F.z),v.push(0,A,0),D.x=ce*.5+.5,D.y=j*.5*A+.5,M.push(D.x,D.y),T++}for(let te=0;te<a;te++){const J=O+te,oe=H+te;w===!0?g.push(oe,oe+1,J):g.push(oe+1,oe,J),B+=3}m.addGroup(x,B,w===!0?1:2),x+=B}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new pn(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}}class jf extends Xt{constructor(e=[],t=[],r=1,a=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:r,detail:a};const l=[],u=[];d(a),m(r),g(),this.setAttribute("position",new Ht(l,3)),this.setAttribute("normal",new Ht(l.slice(),3)),this.setAttribute("uv",new Ht(u,2)),a===0?this.computeVertexNormals():this.normalizeNormals();function d(L){const N=new V,w=new V,O=new V;for(let D=0;D<t.length;D+=3)M(t[D+0],N),M(t[D+1],w),M(t[D+2],O),h(N,w,O,L)}function h(L,N,w,O){const D=O+1,F=[];for(let B=0;B<=D;B++){F[B]=[];const P=L.clone().lerp(w,B/D),A=N.clone().lerp(w,B/D),H=D-B;for(let te=0;te<=H;te++)te===0&&B===D?F[B][te]=P:F[B][te]=P.clone().lerp(A,te/H)}for(let B=0;B<D;B++)for(let P=0;P<2*(D-B)-1;P++){const A=Math.floor(P/2);P%2===0?(v(F[B][A+1]),v(F[B+1][A]),v(F[B][A])):(v(F[B][A+1]),v(F[B+1][A+1]),v(F[B+1][A]))}}function m(L){const N=new V;for(let w=0;w<l.length;w+=3)N.x=l[w+0],N.y=l[w+1],N.z=l[w+2],N.normalize().multiplyScalar(L),l[w+0]=N.x,l[w+1]=N.y,l[w+2]=N.z}function g(){const L=new V;for(let N=0;N<l.length;N+=3){L.x=l[N+0],L.y=l[N+1],L.z=l[N+2];const w=y(L)/2/Math.PI+.5,O=x(L)/Math.PI+.5;u.push(w,1-O)}T(),_()}function _(){for(let L=0;L<u.length;L+=6){const N=u[L+0],w=u[L+2],O=u[L+4],D=Math.max(N,w,O),F=Math.min(N,w,O);D>.9&&F<.1&&(N<.2&&(u[L+0]+=1),w<.2&&(u[L+2]+=1),O<.2&&(u[L+4]+=1))}}function v(L){l.push(L.x,L.y,L.z)}function M(L,N){const w=L*3;N.x=e[w+0],N.y=e[w+1],N.z=e[w+2]}function T(){const L=new V,N=new V,w=new V,O=new V,D=new ut,F=new ut,B=new ut;for(let P=0,A=0;P<l.length;P+=9,A+=6){L.set(l[P+0],l[P+1],l[P+2]),N.set(l[P+3],l[P+4],l[P+5]),w.set(l[P+6],l[P+7],l[P+8]),D.set(u[A+0],u[A+1]),F.set(u[A+2],u[A+3]),B.set(u[A+4],u[A+5]),O.copy(L).add(N).add(w).divideScalar(3);const H=y(O);b(D,A+0,L,H),b(F,A+2,N,H),b(B,A+4,w,H)}}function b(L,N,w,O){O<0&&L.x===1&&(u[N]=L.x-1),w.x===0&&w.z===0&&(u[N]=O/2/Math.PI+.5)}function y(L){return Math.atan2(L.z,-L.x)}function x(L){return Math.atan2(-L.y,Math.sqrt(L.x*L.x+L.z*L.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new jf(e.vertices,e.indices,e.radius,e.details)}}class so extends jf{constructor(e=1,t=0){const r=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],a=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(r,a,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new so(e.radius,e.detail)}}class gc extends Xt{constructor(e=1,t=32,r=16,a=0,l=Math.PI*2,u=0,d=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:r,phiStart:a,phiLength:l,thetaStart:u,thetaLength:d},t=Math.max(3,Math.floor(t)),r=Math.max(2,Math.floor(r));const h=Math.min(u+d,Math.PI);let m=0;const g=[],_=new V,v=new V,M=[],T=[],b=[],y=[];for(let x=0;x<=r;x++){const L=[],N=x/r;let w=0;x===0&&u===0?w=.5/t:x===r&&h===Math.PI&&(w=-.5/t);for(let O=0;O<=t;O++){const D=O/t;_.x=-e*Math.cos(a+D*l)*Math.sin(u+N*d),_.y=e*Math.cos(u+N*d),_.z=e*Math.sin(a+D*l)*Math.sin(u+N*d),T.push(_.x,_.y,_.z),v.copy(_).normalize(),b.push(v.x,v.y,v.z),y.push(D+w,1-N),L.push(m++)}g.push(L)}for(let x=0;x<r;x++)for(let L=0;L<t;L++){const N=g[x][L+1],w=g[x][L],O=g[x+1][L],D=g[x+1][L+1];(x!==0||u>0)&&M.push(N,w,D),(x!==r-1||h<Math.PI)&&M.push(w,O,D)}this.setIndex(M),this.setAttribute("position",new Ht(T,3)),this.setAttribute("normal",new Ht(b,3)),this.setAttribute("uv",new Ht(y,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new gc(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}}class Nr extends Xt{constructor(e=1,t=.4,r=12,a=48,l=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:r,tubularSegments:a,arc:l},r=Math.floor(r),a=Math.floor(a);const u=[],d=[],h=[],m=[],g=new V,_=new V,v=new V;for(let M=0;M<=r;M++)for(let T=0;T<=a;T++){const b=T/a*l,y=M/r*Math.PI*2;_.x=(e+t*Math.cos(y))*Math.cos(b),_.y=(e+t*Math.cos(y))*Math.sin(b),_.z=t*Math.sin(y),d.push(_.x,_.y,_.z),g.x=e*Math.cos(b),g.y=e*Math.sin(b),v.subVectors(_,g).normalize(),h.push(v.x,v.y,v.z),m.push(T/a),m.push(M/r)}for(let M=1;M<=r;M++)for(let T=1;T<=a;T++){const b=(a+1)*M+T-1,y=(a+1)*(M-1)+T-1,x=(a+1)*(M-1)+T,L=(a+1)*M+T;u.push(b,y,L),u.push(y,x,L)}this.setIndex(u),this.setAttribute("position",new Ht(d,3)),this.setAttribute("normal",new Ht(h,3)),this.setAttribute("uv",new Ht(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new Nr(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}}class Zw extends ps{static get type(){return"MeshStandardMaterial"}constructor(e){super(),this.isMeshStandardMaterial=!0,this.defines={STANDARD:""},this.color=new mt(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new mt(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=Zg,this.normalScale=new ut(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Mi,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}}class gx extends Kt{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new mt(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){const t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(t.object.target=this.target.uuid),t}}const Dd=new Ft,b0=new V,A0=new V;class Kw{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new ut(512,512),this.map=null,this.mapPass=null,this.matrix=new Ft,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new Vf,this._frameExtents=new ut(1,1),this._viewportCount=1,this._viewports=[new qt(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){const t=this.camera,r=this.matrix;b0.setFromMatrixPosition(e.matrixWorld),t.position.copy(b0),A0.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(A0),t.updateMatrixWorld(),Dd.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Dd),r.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),r.multiply(Dd)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){const e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}}class Qw extends Kw{constructor(){super(new lx(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}}class C0 extends gx{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(Kt.DEFAULT_UP),this.updateMatrix(),this.target=new Kt,this.shadow=new Qw}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}}class Jw extends gx{constructor(e,t){super(e,t),this.isAmbientLight=!0,this.type="AmbientLight"}}class eT{constructor(e=!0){this.autoStart=e,this.startTime=0,this.oldTime=0,this.elapsedTime=0,this.running=!1}start(){this.startTime=R0(),this.oldTime=this.startTime,this.elapsedTime=0,this.running=!0}stop(){this.getElapsedTime(),this.running=!1,this.autoStart=!1}getElapsedTime(){return this.getDelta(),this.elapsedTime}getDelta(){let e=0;if(this.autoStart&&!this.running)return this.start(),0;if(this.running){const t=R0();e=(t-this.oldTime)/1e3,this.oldTime=t,this.elapsedTime+=e}return e}}function R0(){return performance.now()}const P0=new Ft;class xx{constructor(e,t,r=0,a=1/0){this.ray=new Bf(e,t),this.near=r,this.far=a,this.camera=null,this.layers=new Hf,this.params={Mesh:{},Line:{threshold:1},LOD:{},Points:{threshold:1},Sprite:{}}}set(e,t){this.ray.set(e,t)}setFromCamera(e,t){t.isPerspectiveCamera?(this.ray.origin.setFromMatrixPosition(t.matrixWorld),this.ray.direction.set(e.x,e.y,.5).unproject(t).sub(this.ray.origin).normalize(),this.camera=t):t.isOrthographicCamera?(this.ray.origin.set(e.x,e.y,(t.near+t.far)/(t.near-t.far)).unproject(t),this.ray.direction.set(0,0,-1).transformDirection(t.matrixWorld),this.camera=t):console.error("THREE.Raycaster: Unsupported camera type: "+t.type)}setFromXRController(e){return P0.identity().extractRotation(e.matrixWorld),this.ray.origin.setFromMatrixPosition(e.matrixWorld),this.ray.direction.set(0,0,-1).applyMatrix4(P0),this}intersectObject(e,t=!0,r=[]){return Rf(e,this,r,t),r.sort(N0),r}intersectObjects(e,t=!0,r=[]){for(let a=0,l=e.length;a<l;a++)Rf(e[a],this,r,t);return r.sort(N0),r}}function N0(s,e){return s.distance-e.distance}function Rf(s,e,t,r){let a=!0;if(s.layers.test(e.layers)&&s.raycast(e,t)===!1&&(a=!1),a===!0&&r===!0){const l=s.children;for(let u=0,d=l.length;u<d;u++)Rf(l[u],e,t,!0)}}class vx extends Yw{constructor(e=10,t=10,r=4473924,a=8947848){r=new mt(r),a=new mt(a);const l=t/2,u=e/t,d=e/2,h=[],m=[];for(let v=0,M=0,T=-d;v<=t;v++,T+=u){h.push(-d,0,T,d,0,T),h.push(T,0,-d,T,0,d);const b=v===l?r:a;b.toArray(m,M),M+=3,b.toArray(m,M),M+=3,b.toArray(m,M),M+=3,b.toArray(m,M),M+=3}const g=new Xt;g.setAttribute("position",new Ht(h,3)),g.setAttribute("color",new Ht(m,3));const _=new Zi({vertexColors:!0,toneMapped:!1});super(g,_),this.type="GridHelper"}dispose(){this.geometry.dispose(),this.material.dispose()}}class tT extends hs{constructor(e,t=null){super(),this.object=e,this.domElement=t,this.enabled=!0,this.state=-1,this.keys={},this.mouseButtons={LEFT:null,MIDDLE:null,RIGHT:null},this.touches={ONE:null,TWO:null}}connect(){}disconnect(){}dispose(){}update(){}}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:Df}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__=Df);const is=new xx,En=new V,Rr=new V,Gt=new Nn,L0={X:new V(1,0,0),Y:new V(0,1,0),Z:new V(0,0,1)},Id={type:"change"},D0={type:"mouseDown",mode:null},I0={type:"mouseUp",mode:null},U0={type:"objectChange"};class nT extends tT{constructor(e,t=null){super(void 0,t);const r=new lT(this);this._root=r;const a=new cT;this._gizmo=a,r.add(a);const l=new uT;this._plane=l,r.add(l);const u=this;function d(N,w){let O=w;Object.defineProperty(u,N,{get:function(){return O!==void 0?O:w},set:function(D){O!==D&&(O=D,l[N]=D,a[N]=D,u.dispatchEvent({type:N+"-changed",value:D}),u.dispatchEvent(Id))}}),u[N]=w,l[N]=w,a[N]=w}d("camera",e),d("object",void 0),d("enabled",!0),d("axis",null),d("mode","translate"),d("translationSnap",null),d("rotationSnap",null),d("scaleSnap",null),d("space","world"),d("size",1),d("dragging",!1),d("showX",!0),d("showY",!0),d("showZ",!0),d("minX",-1/0),d("maxX",1/0),d("minY",-1/0),d("maxY",1/0),d("minZ",-1/0),d("maxZ",1/0);const h=new V,m=new V,g=new Nn,_=new Nn,v=new V,M=new Nn,T=new V,b=new V,y=new V,x=0,L=new V;d("worldPosition",h),d("worldPositionStart",m),d("worldQuaternion",g),d("worldQuaternionStart",_),d("cameraPosition",v),d("cameraQuaternion",M),d("pointStart",T),d("pointEnd",b),d("rotationAxis",y),d("rotationAngle",x),d("eye",L),this._offset=new V,this._startNorm=new V,this._endNorm=new V,this._cameraScale=new V,this._parentPosition=new V,this._parentQuaternion=new Nn,this._parentQuaternionInv=new Nn,this._parentScale=new V,this._worldScaleStart=new V,this._worldQuaternionInv=new Nn,this._worldScale=new V,this._positionStart=new V,this._quaternionStart=new Nn,this._scaleStart=new V,this._getPointer=iT.bind(this),this._onPointerDown=sT.bind(this),this._onPointerHover=rT.bind(this),this._onPointerMove=oT.bind(this),this._onPointerUp=aT.bind(this),t!==null&&this.connect()}connect(){this.domElement.addEventListener("pointerdown",this._onPointerDown),this.domElement.addEventListener("pointermove",this._onPointerHover),this.domElement.addEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="none"}disconnect(){this.domElement.removeEventListener("pointerdown",this._onPointerDown),this.domElement.removeEventListener("pointermove",this._onPointerHover),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.domElement.removeEventListener("pointerup",this._onPointerUp),this.domElement.style.touchAction="auto"}getHelper(){return this._root}pointerHover(e){if(this.object===void 0||this.dragging===!0)return;e!==null&&is.setFromCamera(e,this.camera);const t=Ud(this._gizmo.picker[this.mode],is);t?this.axis=t.object.name:this.axis=null}pointerDown(e){if(!(this.object===void 0||this.dragging===!0||e!=null&&e.button!==0)&&this.axis!==null){e!==null&&is.setFromCamera(e,this.camera);const t=Ud(this._plane,is,!0);t&&(this.object.updateMatrixWorld(),this.object.parent.updateMatrixWorld(),this._positionStart.copy(this.object.position),this._quaternionStart.copy(this.object.quaternion),this._scaleStart.copy(this.object.scale),this.object.matrixWorld.decompose(this.worldPositionStart,this.worldQuaternionStart,this._worldScaleStart),this.pointStart.copy(t.point).sub(this.worldPositionStart)),this.dragging=!0,D0.mode=this.mode,this.dispatchEvent(D0)}}pointerMove(e){const t=this.axis,r=this.mode,a=this.object;let l=this.space;if(r==="scale"?l="local":(t==="E"||t==="XYZE"||t==="XYZ")&&(l="world"),a===void 0||t===null||this.dragging===!1||e!==null&&e.button!==-1)return;e!==null&&is.setFromCamera(e,this.camera);const u=Ud(this._plane,is,!0);if(u){if(this.pointEnd.copy(u.point).sub(this.worldPositionStart),r==="translate")this._offset.copy(this.pointEnd).sub(this.pointStart),l==="local"&&t!=="XYZ"&&this._offset.applyQuaternion(this._worldQuaternionInv),t.indexOf("X")===-1&&(this._offset.x=0),t.indexOf("Y")===-1&&(this._offset.y=0),t.indexOf("Z")===-1&&(this._offset.z=0),l==="local"&&t!=="XYZ"?this._offset.applyQuaternion(this._quaternionStart).divide(this._parentScale):this._offset.applyQuaternion(this._parentQuaternionInv).divide(this._parentScale),a.position.copy(this._offset).add(this._positionStart),this.translationSnap&&(l==="local"&&(a.position.applyQuaternion(Gt.copy(this._quaternionStart).invert()),t.search("X")!==-1&&(a.position.x=Math.round(a.position.x/this.translationSnap)*this.translationSnap),t.search("Y")!==-1&&(a.position.y=Math.round(a.position.y/this.translationSnap)*this.translationSnap),t.search("Z")!==-1&&(a.position.z=Math.round(a.position.z/this.translationSnap)*this.translationSnap),a.position.applyQuaternion(this._quaternionStart)),l==="world"&&(a.parent&&a.position.add(En.setFromMatrixPosition(a.parent.matrixWorld)),t.search("X")!==-1&&(a.position.x=Math.round(a.position.x/this.translationSnap)*this.translationSnap),t.search("Y")!==-1&&(a.position.y=Math.round(a.position.y/this.translationSnap)*this.translationSnap),t.search("Z")!==-1&&(a.position.z=Math.round(a.position.z/this.translationSnap)*this.translationSnap),a.parent&&a.position.sub(En.setFromMatrixPosition(a.parent.matrixWorld)))),a.position.x=Math.max(this.minX,Math.min(this.maxX,a.position.x)),a.position.y=Math.max(this.minY,Math.min(this.maxY,a.position.y)),a.position.z=Math.max(this.minZ,Math.min(this.maxZ,a.position.z));else if(r==="scale"){if(t.search("XYZ")!==-1){let d=this.pointEnd.length()/this.pointStart.length();this.pointEnd.dot(this.pointStart)<0&&(d*=-1),Rr.set(d,d,d)}else En.copy(this.pointStart),Rr.copy(this.pointEnd),En.applyQuaternion(this._worldQuaternionInv),Rr.applyQuaternion(this._worldQuaternionInv),Rr.divide(En),t.search("X")===-1&&(Rr.x=1),t.search("Y")===-1&&(Rr.y=1),t.search("Z")===-1&&(Rr.z=1);a.scale.copy(this._scaleStart).multiply(Rr),this.scaleSnap&&(t.search("X")!==-1&&(a.scale.x=Math.round(a.scale.x/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search("Y")!==-1&&(a.scale.y=Math.round(a.scale.y/this.scaleSnap)*this.scaleSnap||this.scaleSnap),t.search("Z")!==-1&&(a.scale.z=Math.round(a.scale.z/this.scaleSnap)*this.scaleSnap||this.scaleSnap))}else if(r==="rotate"){this._offset.copy(this.pointEnd).sub(this.pointStart);const d=20/this.worldPosition.distanceTo(En.setFromMatrixPosition(this.camera.matrixWorld));let h=!1;t==="XYZE"?(this.rotationAxis.copy(this._offset).cross(this.eye).normalize(),this.rotationAngle=this._offset.dot(En.copy(this.rotationAxis).cross(this.eye))*d):(t==="X"||t==="Y"||t==="Z")&&(this.rotationAxis.copy(L0[t]),En.copy(L0[t]),l==="local"&&En.applyQuaternion(this.worldQuaternion),En.cross(this.eye),En.length()===0?h=!0:this.rotationAngle=this._offset.dot(En.normalize())*d),(t==="E"||h)&&(this.rotationAxis.copy(this.eye),this.rotationAngle=this.pointEnd.angleTo(this.pointStart),this._startNorm.copy(this.pointStart).normalize(),this._endNorm.copy(this.pointEnd).normalize(),this.rotationAngle*=this._endNorm.cross(this._startNorm).dot(this.eye)<0?1:-1),this.rotationSnap&&(this.rotationAngle=Math.round(this.rotationAngle/this.rotationSnap)*this.rotationSnap),l==="local"&&t!=="E"&&t!=="XYZE"?(a.quaternion.copy(this._quaternionStart),a.quaternion.multiply(Gt.setFromAxisAngle(this.rotationAxis,this.rotationAngle)).normalize()):(this.rotationAxis.applyQuaternion(this._parentQuaternionInv),a.quaternion.copy(Gt.setFromAxisAngle(this.rotationAxis,this.rotationAngle)),a.quaternion.multiply(this._quaternionStart).normalize())}this.dispatchEvent(Id),this.dispatchEvent(U0)}}pointerUp(e){e!==null&&e.button!==0||(this.dragging&&this.axis!==null&&(I0.mode=this.mode,this.dispatchEvent(I0)),this.dragging=!1,this.axis=null)}dispose(){this.disconnect(),this._root.dispose()}attach(e){return this.object=e,this._root.visible=!0,this}detach(){return this.object=void 0,this.axis=null,this._root.visible=!1,this}reset(){this.enabled&&this.dragging&&(this.object.position.copy(this._positionStart),this.object.quaternion.copy(this._quaternionStart),this.object.scale.copy(this._scaleStart),this.dispatchEvent(Id),this.dispatchEvent(U0),this.pointStart.copy(this.pointEnd))}getRaycaster(){return is}getMode(){return this.mode}setMode(e){this.mode=e}setTranslationSnap(e){this.translationSnap=e}setRotationSnap(e){this.rotationSnap=e}setScaleSnap(e){this.scaleSnap=e}setSize(e){this.size=e}setSpace(e){this.space=e}}function iT(s){if(this.domElement.ownerDocument.pointerLockElement)return{x:0,y:0,button:s.button};{const e=this.domElement.getBoundingClientRect();return{x:(s.clientX-e.left)/e.width*2-1,y:-(s.clientY-e.top)/e.height*2+1,button:s.button}}}function rT(s){if(this.enabled)switch(s.pointerType){case"mouse":case"pen":this.pointerHover(this._getPointer(s));break}}function sT(s){this.enabled&&(document.pointerLockElement||this.domElement.setPointerCapture(s.pointerId),this.domElement.addEventListener("pointermove",this._onPointerMove),this.pointerHover(this._getPointer(s)),this.pointerDown(this._getPointer(s)))}function oT(s){this.enabled&&this.pointerMove(this._getPointer(s))}function aT(s){this.enabled&&(this.domElement.releasePointerCapture(s.pointerId),this.domElement.removeEventListener("pointermove",this._onPointerMove),this.pointerUp(this._getPointer(s)))}function Ud(s,e,t){const r=e.intersectObject(s,!0);for(let a=0;a<r.length;a++)if(r[a].object.visible||t)return r[a];return!1}const Yl=new Mi,Ut=new V(0,1,0),F0=new V(0,0,0),k0=new Ft,ql=new Nn,ic=new Nn,Ri=new V,O0=new Ft,ca=new V(1,0,0),os=new V(0,1,0),ua=new V(0,0,1),Zl=new V,ra=new V,sa=new V;class lT extends Kt{constructor(e){super(),this.isTransformControlsRoot=!0,this.controls=e,this.visible=!1}updateMatrixWorld(e){const t=this.controls;t.object!==void 0&&(t.object.updateMatrixWorld(),t.object.parent===null?console.error("TransformControls: The attached 3D object must be a part of the scene graph."):t.object.parent.matrixWorld.decompose(t._parentPosition,t._parentQuaternion,t._parentScale),t.object.matrixWorld.decompose(t.worldPosition,t.worldQuaternion,t._worldScale),t._parentQuaternionInv.copy(t._parentQuaternion).invert(),t._worldQuaternionInv.copy(t.worldQuaternion).invert()),t.camera.updateMatrixWorld(),t.camera.matrixWorld.decompose(t.cameraPosition,t.cameraQuaternion,t._cameraScale),t.camera.isOrthographicCamera?t.camera.getWorldDirection(t.eye).negate():t.eye.copy(t.cameraPosition).sub(t.worldPosition).normalize(),super.updateMatrixWorld(e)}dispose(){this.traverse(function(e){e.geometry&&e.geometry.dispose(),e.material&&e.material.dispose()})}}class cT extends Kt{constructor(){super(),this.isTransformControlsGizmo=!0,this.type="TransformControlsGizmo";const e=new pc({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),t=new Zi({depthTest:!1,depthWrite:!1,fog:!1,toneMapped:!1,transparent:!0}),r=e.clone();r.opacity=.15;const a=t.clone();a.opacity=.5;const l=e.clone();l.color.setHex(16711680);const u=e.clone();u.color.setHex(65280);const d=e.clone();d.color.setHex(255);const h=e.clone();h.color.setHex(16711680),h.opacity=.5;const m=e.clone();m.color.setHex(65280),m.opacity=.5;const g=e.clone();g.color.setHex(255),g.opacity=.5;const _=e.clone();_.opacity=.25;const v=e.clone();v.color.setHex(16776960),v.opacity=.25,e.clone().color.setHex(16776960);const T=e.clone();T.color.setHex(7895160);const b=new pn(0,.04,.1,12);b.translate(0,.05,0);const y=new Yt(.08,.08,.08);y.translate(0,.04,0);const x=new Xt;x.setAttribute("position",new Ht([0,0,0,1,0,0],3));const L=new pn(.0075,.0075,.5,3);L.translate(0,.25,0);function N(ce,j){const Q=new Nr(ce,.0075,3,64,j*Math.PI*2);return Q.rotateY(Math.PI/2),Q.rotateX(Math.PI/2),Q}function w(){const ce=new Xt;return ce.setAttribute("position",new Ht([0,0,0,1,1,1],3)),ce}const O={X:[[new Fe(b,l),[.5,0,0],[0,0,-Math.PI/2]],[new Fe(b,l),[-.5,0,0],[0,0,Math.PI/2]],[new Fe(L,l),[0,0,0],[0,0,-Math.PI/2]]],Y:[[new Fe(b,u),[0,.5,0]],[new Fe(b,u),[0,-.5,0],[Math.PI,0,0]],[new Fe(L,u)]],Z:[[new Fe(b,d),[0,0,.5],[Math.PI/2,0,0]],[new Fe(b,d),[0,0,-.5],[-Math.PI/2,0,0]],[new Fe(L,d),null,[Math.PI/2,0,0]]],XYZ:[[new Fe(new so(.1,0),_.clone()),[0,0,0]]],XY:[[new Fe(new Yt(.15,.15,.01),g.clone()),[.15,.15,0]]],YZ:[[new Fe(new Yt(.15,.15,.01),h.clone()),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new Fe(new Yt(.15,.15,.01),m.clone()),[.15,0,.15],[-Math.PI/2,0,0]]]},D={X:[[new Fe(new pn(.2,0,.6,4),r),[.3,0,0],[0,0,-Math.PI/2]],[new Fe(new pn(.2,0,.6,4),r),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new Fe(new pn(.2,0,.6,4),r),[0,.3,0]],[new Fe(new pn(.2,0,.6,4),r),[0,-.3,0],[0,0,Math.PI]]],Z:[[new Fe(new pn(.2,0,.6,4),r),[0,0,.3],[Math.PI/2,0,0]],[new Fe(new pn(.2,0,.6,4),r),[0,0,-.3],[-Math.PI/2,0,0]]],XYZ:[[new Fe(new so(.2,0),r)]],XY:[[new Fe(new Yt(.2,.2,.01),r),[.15,.15,0]]],YZ:[[new Fe(new Yt(.2,.2,.01),r),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new Fe(new Yt(.2,.2,.01),r),[.15,0,.15],[-Math.PI/2,0,0]]]},F={START:[[new Fe(new so(.01,2),a),null,null,null,"helper"]],END:[[new Fe(new so(.01,2),a),null,null,null,"helper"]],DELTA:[[new wn(w(),a),null,null,null,"helper"]],X:[[new wn(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new wn(x,a.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new wn(x,a.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]},B={XYZE:[[new Fe(N(.5,1),T),null,[0,Math.PI/2,0]]],X:[[new Fe(N(.5,.5),l)]],Y:[[new Fe(N(.5,.5),u),null,[0,0,-Math.PI/2]]],Z:[[new Fe(N(.5,.5),d),null,[0,Math.PI/2,0]]],E:[[new Fe(N(.75,1),v),null,[0,Math.PI/2,0]]]},P={AXIS:[[new wn(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]]},A={XYZE:[[new Fe(new gc(.25,10,8),r)]],X:[[new Fe(new Nr(.5,.1,4,24),r),[0,0,0],[0,-Math.PI/2,-Math.PI/2]]],Y:[[new Fe(new Nr(.5,.1,4,24),r),[0,0,0],[Math.PI/2,0,0]]],Z:[[new Fe(new Nr(.5,.1,4,24),r),[0,0,0],[0,0,-Math.PI/2]]],E:[[new Fe(new Nr(.75,.1,2,24),r)]]},H={X:[[new Fe(y,l),[.5,0,0],[0,0,-Math.PI/2]],[new Fe(L,l),[0,0,0],[0,0,-Math.PI/2]],[new Fe(y,l),[-.5,0,0],[0,0,Math.PI/2]]],Y:[[new Fe(y,u),[0,.5,0]],[new Fe(L,u)],[new Fe(y,u),[0,-.5,0],[0,0,Math.PI]]],Z:[[new Fe(y,d),[0,0,.5],[Math.PI/2,0,0]],[new Fe(L,d),[0,0,0],[Math.PI/2,0,0]],[new Fe(y,d),[0,0,-.5],[-Math.PI/2,0,0]]],XY:[[new Fe(new Yt(.15,.15,.01),g),[.15,.15,0]]],YZ:[[new Fe(new Yt(.15,.15,.01),h),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new Fe(new Yt(.15,.15,.01),m),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new Fe(new Yt(.1,.1,.1),_.clone())]]},te={X:[[new Fe(new pn(.2,0,.6,4),r),[.3,0,0],[0,0,-Math.PI/2]],[new Fe(new pn(.2,0,.6,4),r),[-.3,0,0],[0,0,Math.PI/2]]],Y:[[new Fe(new pn(.2,0,.6,4),r),[0,.3,0]],[new Fe(new pn(.2,0,.6,4),r),[0,-.3,0],[0,0,Math.PI]]],Z:[[new Fe(new pn(.2,0,.6,4),r),[0,0,.3],[Math.PI/2,0,0]],[new Fe(new pn(.2,0,.6,4),r),[0,0,-.3],[-Math.PI/2,0,0]]],XY:[[new Fe(new Yt(.2,.2,.01),r),[.15,.15,0]]],YZ:[[new Fe(new Yt(.2,.2,.01),r),[0,.15,.15],[0,Math.PI/2,0]]],XZ:[[new Fe(new Yt(.2,.2,.01),r),[.15,0,.15],[-Math.PI/2,0,0]]],XYZ:[[new Fe(new Yt(.2,.2,.2),r),[0,0,0]]]},J={X:[[new wn(x,a.clone()),[-1e3,0,0],null,[1e6,1,1],"helper"]],Y:[[new wn(x,a.clone()),[0,-1e3,0],[0,0,Math.PI/2],[1e6,1,1],"helper"]],Z:[[new wn(x,a.clone()),[0,0,-1e3],[0,-Math.PI/2,0],[1e6,1,1],"helper"]]};function oe(ce){const j=new Kt;for(const Q in ce)for(let z=ce[Q].length;z--;){const X=ce[Q][z][0].clone(),q=ce[Q][z][1],I=ce[Q][z][2],ie=ce[Q][z][3],be=ce[Q][z][4];X.name=Q,X.tag=be,q&&X.position.set(q[0],q[1],q[2]),I&&X.rotation.set(I[0],I[1],I[2]),ie&&X.scale.set(ie[0],ie[1],ie[2]),X.updateMatrix();const ne=X.geometry.clone();ne.applyMatrix4(X.matrix),X.geometry=ne,X.renderOrder=1/0,X.position.set(0,0,0),X.rotation.set(0,0,0),X.scale.set(1,1,1),j.add(X)}return j}this.gizmo={},this.picker={},this.helper={},this.add(this.gizmo.translate=oe(O)),this.add(this.gizmo.rotate=oe(B)),this.add(this.gizmo.scale=oe(H)),this.add(this.picker.translate=oe(D)),this.add(this.picker.rotate=oe(A)),this.add(this.picker.scale=oe(te)),this.add(this.helper.translate=oe(F)),this.add(this.helper.rotate=oe(P)),this.add(this.helper.scale=oe(J)),this.picker.translate.visible=!1,this.picker.rotate.visible=!1,this.picker.scale.visible=!1}updateMatrixWorld(e){const r=(this.mode==="scale"?"local":this.space)==="local"?this.worldQuaternion:ic;this.gizmo.translate.visible=this.mode==="translate",this.gizmo.rotate.visible=this.mode==="rotate",this.gizmo.scale.visible=this.mode==="scale",this.helper.translate.visible=this.mode==="translate",this.helper.rotate.visible=this.mode==="rotate",this.helper.scale.visible=this.mode==="scale";let a=[];a=a.concat(this.picker[this.mode].children),a=a.concat(this.gizmo[this.mode].children),a=a.concat(this.helper[this.mode].children);for(let l=0;l<a.length;l++){const u=a[l];u.visible=!0,u.rotation.set(0,0,0),u.position.copy(this.worldPosition);let d;if(this.camera.isOrthographicCamera?d=(this.camera.top-this.camera.bottom)/this.camera.zoom:d=this.worldPosition.distanceTo(this.cameraPosition)*Math.min(1.9*Math.tan(Math.PI*this.camera.fov/360)/this.camera.zoom,7),u.scale.set(1,1,1).multiplyScalar(d*this.size/4),u.tag==="helper"){u.visible=!1,u.name==="AXIS"?(u.visible=!!this.axis,this.axis==="X"&&(Gt.setFromEuler(Yl.set(0,0,0)),u.quaternion.copy(r).multiply(Gt),Math.abs(Ut.copy(ca).applyQuaternion(r).dot(this.eye))>.9&&(u.visible=!1)),this.axis==="Y"&&(Gt.setFromEuler(Yl.set(0,0,Math.PI/2)),u.quaternion.copy(r).multiply(Gt),Math.abs(Ut.copy(os).applyQuaternion(r).dot(this.eye))>.9&&(u.visible=!1)),this.axis==="Z"&&(Gt.setFromEuler(Yl.set(0,Math.PI/2,0)),u.quaternion.copy(r).multiply(Gt),Math.abs(Ut.copy(ua).applyQuaternion(r).dot(this.eye))>.9&&(u.visible=!1)),this.axis==="XYZE"&&(Gt.setFromEuler(Yl.set(0,Math.PI/2,0)),Ut.copy(this.rotationAxis),u.quaternion.setFromRotationMatrix(k0.lookAt(F0,Ut,os)),u.quaternion.multiply(Gt),u.visible=this.dragging),this.axis==="E"&&(u.visible=!1)):u.name==="START"?(u.position.copy(this.worldPositionStart),u.visible=this.dragging):u.name==="END"?(u.position.copy(this.worldPosition),u.visible=this.dragging):u.name==="DELTA"?(u.position.copy(this.worldPositionStart),u.quaternion.copy(this.worldQuaternionStart),En.set(1e-10,1e-10,1e-10).add(this.worldPositionStart).sub(this.worldPosition).multiplyScalar(-1),En.applyQuaternion(this.worldQuaternionStart.clone().invert()),u.scale.copy(En),u.visible=this.dragging):(u.quaternion.copy(r),this.dragging?u.position.copy(this.worldPositionStart):u.position.copy(this.worldPosition),this.axis&&(u.visible=this.axis.search(u.name)!==-1));continue}u.quaternion.copy(r),this.mode==="translate"||this.mode==="scale"?(u.name==="X"&&Math.abs(Ut.copy(ca).applyQuaternion(r).dot(this.eye))>.99&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1),u.name==="Y"&&Math.abs(Ut.copy(os).applyQuaternion(r).dot(this.eye))>.99&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1),u.name==="Z"&&Math.abs(Ut.copy(ua).applyQuaternion(r).dot(this.eye))>.99&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1),u.name==="XY"&&Math.abs(Ut.copy(ua).applyQuaternion(r).dot(this.eye))<.2&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1),u.name==="YZ"&&Math.abs(Ut.copy(ca).applyQuaternion(r).dot(this.eye))<.2&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1),u.name==="XZ"&&Math.abs(Ut.copy(os).applyQuaternion(r).dot(this.eye))<.2&&(u.scale.set(1e-10,1e-10,1e-10),u.visible=!1)):this.mode==="rotate"&&(ql.copy(r),Ut.copy(this.eye).applyQuaternion(Gt.copy(r).invert()),u.name.search("E")!==-1&&u.quaternion.setFromRotationMatrix(k0.lookAt(this.eye,F0,os)),u.name==="X"&&(Gt.setFromAxisAngle(ca,Math.atan2(-Ut.y,Ut.z)),Gt.multiplyQuaternions(ql,Gt),u.quaternion.copy(Gt)),u.name==="Y"&&(Gt.setFromAxisAngle(os,Math.atan2(Ut.x,Ut.z)),Gt.multiplyQuaternions(ql,Gt),u.quaternion.copy(Gt)),u.name==="Z"&&(Gt.setFromAxisAngle(ua,Math.atan2(Ut.y,Ut.x)),Gt.multiplyQuaternions(ql,Gt),u.quaternion.copy(Gt))),u.visible=u.visible&&(u.name.indexOf("X")===-1||this.showX),u.visible=u.visible&&(u.name.indexOf("Y")===-1||this.showY),u.visible=u.visible&&(u.name.indexOf("Z")===-1||this.showZ),u.visible=u.visible&&(u.name.indexOf("E")===-1||this.showX&&this.showY&&this.showZ),u.material._color=u.material._color||u.material.color.clone(),u.material._opacity=u.material._opacity||u.material.opacity,u.material.color.copy(u.material._color),u.material.opacity=u.material._opacity,this.enabled&&this.axis&&(u.name===this.axis||this.axis.split("").some(function(h){return u.name===h}))&&(u.material.color.setHex(16776960),u.material.opacity=1)}super.updateMatrixWorld(e)}}class uT extends Fe{constructor(){super(new ma(1e5,1e5,2,2),new pc({visible:!1,wireframe:!0,side:Ni,transparent:!0,opacity:.1,toneMapped:!1})),this.isTransformControlsPlane=!0,this.type="TransformControlsPlane"}updateMatrixWorld(e){let t=this.space;switch(this.position.copy(this.worldPosition),this.mode==="scale"&&(t="local"),Zl.copy(ca).applyQuaternion(t==="local"?this.worldQuaternion:ic),ra.copy(os).applyQuaternion(t==="local"?this.worldQuaternion:ic),sa.copy(ua).applyQuaternion(t==="local"?this.worldQuaternion:ic),Ut.copy(ra),this.mode){case"translate":case"scale":switch(this.axis){case"X":Ut.copy(this.eye).cross(Zl),Ri.copy(Zl).cross(Ut);break;case"Y":Ut.copy(this.eye).cross(ra),Ri.copy(ra).cross(Ut);break;case"Z":Ut.copy(this.eye).cross(sa),Ri.copy(sa).cross(Ut);break;case"XY":Ri.copy(sa);break;case"YZ":Ri.copy(Zl);break;case"XZ":Ut.copy(sa),Ri.copy(ra);break;case"XYZ":case"E":Ri.set(0,0,0);break}break;case"rotate":default:Ri.set(0,0,0)}Ri.length()===0?this.quaternion.copy(this.cameraQuaternion):(O0.lookAt(En.set(0,0,0),Ri,Ut),this.quaternion.setFromRotationMatrix(O0)),super.updateMatrixWorld(e)}}function dT(s){const e=`
    varying vec2 vUv;
    varying vec3 vWorldPosition;
    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,t=`
    uniform vec3 uCameraPos;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    // Smooth minimum (Polynomial smin by Inigo Quilez)
    float smin(float a, float b, float k) {
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    // Sphere SDF
    float sdSphere(vec3 p, float r) {
      return length(p) - r;
    }

    // Box SDF
    float sdBox(vec3 p, vec3 b) {
      vec3 q = abs(p) - b;
      return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
    }

    // Torus SDF
    float sdTorus(vec3 p, vec2 t) {
      vec2 q = vec2(length(p.xz) - t.x, p.y);
      return length(q) - t.y;
    }

    // Global Scene Distance Field
    float map(vec3 p) {
      // Liquid Clay blobs blending together
      float d1 = sdSphere(p - vec3(-0.6, 0.0, 0.0), 0.9);
      float d2 = sdSphere(p - vec3(0.6 + sin(uTime * 1.5) * 0.3, cos(uTime * 1.5) * 0.3, 0.0), 0.8);
      float d3 = sdBox(p - vec3(0.0, -0.8, 0.0), vec3(1.2, 0.2, 1.2));

      // Smooth clay union
      float d = smin(d1, d2, 0.6);
      d = smin(d, d3, 0.4);
      return d;
    }

    vec3 calcNormal(vec3 p) {
      const float eps = 0.002;
      const vec2 h = vec2(eps, 0.0);
      return normalize(vec3(
        map(p + h.xyy) - map(p - h.xyy),
        map(p + h.yxy) - map(p - h.yxy),
        map(p + h.yyx) - map(p - h.yyx)
      ));
    }

    void main() {
      vec3 ro = uCameraPos;
      vec3 rd = normalize(vWorldPosition - uCameraPos);

      float t = 0.0;
      float tMax = 20.0;
      bool hit = false;
      vec3 p = ro;

      for (int i = 0; i < 64; i++) {
        p = ro + rd * t;
        float d = map(p);
        if (d < 0.001) {
          hit = true;
          break;
        }
        t += d;
        if (t > tMax) break;
      }

      if (hit) {
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(vec3(1.0, 2.0, 1.5));
        
        // PBR clay lighting
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.25;
        vec3 baseColor = vec3(0.95, 0.45, 0.35); // Womp warm terracotta clay
        vec3 col = baseColor * (diff * 0.8 + amb);

        // Rim light
        float rim = 1.0 - max(dot(-rd, n), 0.0);
        col += pow(rim, 3.0) * 0.4 * vec3(1.0, 0.8, 0.7);

        gl_FragColor = vec4(col, 1.0);
      } else {
        discard;
      }
    }
  `;return new tr({vertexShader:e,fragmentShader:t,uniforms:{uCameraPos:{value:new V(0,0,5)},uTime:{value:0}},side:Ln,transparent:!0})}function fT(){const s=new la;s.name="GridAndRulerGroup";const e=10,t=5,r=e/t,a=new vx(e,t,3900150,3359061);a.position.y=-.002,s.add(a);const l=e/2,u=[new V(-l,0,-l),new V(l,0,-l),new V(l,0,l),new V(-l,0,l),new V(-l,0,-l)],d=new Xt().setFromPoints(u),h=new Zi({color:6333946,linewidth:2}),m=new wn(d,h);s.add(m);const g=l+1.5,_=new Xt().setFromPoints([new V(-l,.005,0),new V(g,.005,0)]),v=new wn(_,new Zi({color:15680580,linewidth:3}));s.add(v);const M=new Xt().setFromPoints([new V(0,.005,-l),new V(0,.005,g)]),T=new wn(M,new Zi({color:3900150,linewidth:3}));s.add(T);const b=new Xt().setFromPoints([new V(0,0,0),new V(0,g,0)]),y=new wn(b,new Zi({color:2278750,linewidth:3}));s.add(y);const x=new Zi({color:9741240,linewidth:2});for(let L=0;L<=t;L++){const N=-l+L*r,w=.25,O=new Xt().setFromPoints([new V(N,.01,-w),new V(N,.01,w)]);s.add(new wn(O,x));try{const D=io(`${N.toFixed(0)}`,"#f87171");D.position.set(N,.15,-.5),s.add(D)}catch(D){console.warn("TextSprite error:",D)}}for(let L=0;L<=t;L++){const N=-l+L*r;if(Math.abs(N)<.01)continue;const w=.25,O=new Xt().setFromPoints([new V(-w,.01,N),new V(w,.01,N)]);s.add(new wn(O,x));try{const D=io(`${N.toFixed(0)}`,"#60a5fa");D.position.set(-.5,.15,N),s.add(D)}catch(D){console.warn("TextSprite error:",D)}}for(let L=r;L<=g;L+=r){const w=new Xt().setFromPoints([new V(-.25,L,0),new V(.25,L,0)]);s.add(new wn(w,new Zi({color:4906624,linewidth:2})));try{const O=io(`Y:${L.toFixed(0)}`,"#4ade80");O.position.set(.6,L,0),s.add(O)}catch(O){console.warn("TextSprite error:",O)}}try{const L=io("+X","#ef4444");L.position.set(g+.4,.2,0),L.scale.set(.9,.45,1),s.add(L);const N=io("+Z","#3b82f6");N.position.set(0,.2,g+.4),N.scale.set(.9,.45,1),s.add(N);const w=io("+Y","#22c55e");w.position.set(0,g+.3,0),w.scale.set(.9,.45,1),s.add(w)}catch(L){console.warn("Axis label error:",L)}return s}function io(s,e){const t=document.createElement("canvas");t.width=128,t.height=64;const r=t.getContext("2d");r&&(r.clearRect(0,0,128,64),r.fillStyle="rgba(15, 23, 42, 0.8)",typeof r.roundRect=="function"?(r.roundRect(10,10,108,44,8),r.fill(),r.strokeStyle=e,r.lineWidth=2,r.roundRect(10,10,108,44,8),r.stroke()):(r.fillRect(10,10,108,44),r.strokeStyle=e,r.lineWidth=2,r.strokeRect(10,10,108,44)),r.font="bold 24px monospace",r.fillStyle=e,r.textAlign="center",r.textBaseline="middle",r.fillText(s,64,32));const a=new qw(t);a.minFilter=vi;const l=new px({map:a,depthTest:!1,transparent:!0}),u=new $w(l);return u.scale.set(.7,.35,1),u}const hT=({objects:s,selectedId:e,onSelectObject:t,onUpdateTransform:r,mode:a,tool:l,onChangeTool:u,shading:d})=>{const h=nt.useRef(null),m=nt.useRef(null),g=nt.useRef(null),_=nt.useRef(null),v=nt.useRef(null),M=nt.useRef(new Map),T=nt.useRef(null),[b,y]=nt.useState(!1),x=nt.useRef(!1),L=nt.useRef(!1),N=nt.useRef(!1),w=nt.useRef({x:0,y:0}),O=nt.useRef({radius:14,theta:Math.PI/4,phi:Math.PI/3.2}),D=nt.useRef(new V(0,1,0));nt.useEffect(()=>{if(!h.current)return;const j=h.current;let Q=j.clientWidth||800,z=j.clientHeight||600;const X=new Ww;X.background=new mt(658708),m.current=X;const q=new si(45,Q/z,.1,1e3);g.current=q,F();let I;try{I=new _0({antialias:!0,alpha:!0,powerPreference:"high-performance"})}catch(Ce){console.error("WebGL init error, falling back:",Ce),I=new _0({antialias:!1})}I.setSize(Q,z),I.setPixelRatio(Math.min(window.devicePixelRatio,2)),I.shadowMap.enabled=!0,I.shadowMap.type=Fg,I.toneMapping=Og,I.toneMappingExposure=1.1,j.appendChild(I.domElement),_.current=I;const ie=new Jw(16777215,.7);X.add(ie);const be=new C0(16777215,1.3);be.position.set(8,14,10),be.castShadow=!0,be.shadow.mapSize.width=1024,be.shadow.mapSize.height=1024,be.shadow.bias=-1e-4,X.add(be);const ne=new C0(6333946,.5);ne.position.set(-8,6,-8),X.add(ne);try{const Ce=fT();X.add(Ce)}catch(Ce){console.warn("Grid init error:",Ce);const Ze=new vx(10,5,3900150,3359061);X.add(Ze)}try{const Ce=new nT(q,I.domElement);Ce.size=.85,Ce.space="world",Ce.addEventListener("dragging-changed",Ze=>{N.current=!!Ze.value}),Ce.addEventListener("objectChange",()=>{const Ze=Ce.object;if(Ze&&Ze.userData.id&&r){const Ke=Ze.userData.id,gt=[Ze.position.x,Ze.position.y,Ze.position.z],Y=[Ze.rotation.x,Ze.rotation.y,Ze.rotation.z],dn=[Ze.scale.x,Ze.scale.y,Ze.scale.z];r(Ke,gt,Y,dn)}}),X.add(Ce.getHelper()),v.current=Ce}catch(Ce){console.warn("TransformControls error:",Ce)}try{const Ce=new Yt(5,5,5),Ze=dT([]),Ke=new Fe(Ce,Ze);Ke.position.set(0,1,0),T.current=Ke}catch(Ce){console.warn("SDF Material error:",Ce)}let fe;const Se=new eT,xe=()=>{fe=requestAnimationFrame(xe);const Ce=Se.getDelta(),Ze=Se.getElapsedTime();if(b){let gt=0;for(const Y of M.current.values())Y.rotation.y+=Ce*.8,Y.position.y=1+Math.sin(Ze*2+gt*1.5)*.25,gt++}const Ke=T.current;if(Ke&&Ke.material){const gt=Ke.material;gt.uniforms&&gt.uniforms.uCameraPos&&gt.uniforms.uCameraPos.value.copy(q.position),gt.uniforms&&gt.uniforms.uTime&&(gt.uniforms.uTime.value=Ze)}I.render(X,q)};xe();const Ae=new ResizeObserver(Ce=>{for(const Ze of Ce){const Ke=Ze.contentRect;Ke.width>0&&Ke.height>0&&(q.aspect=Ke.width/Ke.height,q.updateProjectionMatrix(),I.setSize(Ke.width,Ke.height))}});Ae.observe(j);const Ie=()=>{if(!j)return;const Ce=j.clientWidth||800,Ze=j.clientHeight||600;q.aspect=Ce/Ze,q.updateProjectionMatrix(),I.setSize(Ce,Ze)};return window.addEventListener("resize",Ie),()=>{cancelAnimationFrame(fe),Ae.disconnect(),window.removeEventListener("resize",Ie),v.current&&v.current.dispose(),j&&I.domElement&&j.removeChild(I.domElement),I.dispose()}},[]);function F(){if(!g.current)return;const{radius:j,theta:Q,phi:z}=O.current,X=D.current,q=X.x+j*Math.sin(z)*Math.sin(Q),I=X.y+j*Math.cos(z),ie=X.z+j*Math.sin(z)*Math.cos(Q);g.current.position.set(q,I,ie),g.current.lookAt(X)}nt.useEffect(()=>{const j=v.current;j&&(l==="translate"?(j.setMode("translate"),j.enabled=!0):l==="rotate"?(j.setMode("rotate"),j.enabled=!0):l==="scale"?(j.setMode("scale"),j.enabled=!0):(j.enabled=!1,j.detach()))},[l]),nt.useEffect(()=>{const j=m.current,Q=T.current;!j||!Q||(a==="sdf"?j.children.includes(Q)||j.add(Q):j.children.includes(Q)&&j.remove(Q))},[a]),nt.useEffect(()=>{const j=m.current,Q=v.current;if(!j)return;const z=M.current,X=new Set(s.map(q=>q.id));for(const[q,I]of z.entries())X.has(q)||(Q&&Q.object===I&&Q.detach(),j.remove(I),I.geometry.dispose(),Array.isArray(I.material)?I.material.forEach(ie=>ie.dispose()):I.material.dispose(),z.delete(q));for(const q of s){let I=z.get(q.id);if(!I){let ne;switch(q.type){case"sphere":ne=new gc(q.scale[0]*.5,32,24);break;case"cylinder":ne=new pn(q.scale[0]*.5,q.scale[0]*.5,q.scale[1],32);break;case"torus":ne=new Nr(q.scale[0]*.5,q.scale[0]*.2,24,48);break;case"cube":default:ne=new Yt(q.scale[0],q.scale[1],q.scale[2]);break}const fe=d==="wireframe",Se=new Zw({color:new mt(q.color),roughness:q.roughness,metalness:q.metalness,wireframe:fe});I=new Fe(ne,Se),I.castShadow=!0,I.receiveShadow=!0,I.userData={id:q.id},j.add(I),z.set(q.id,I)}N.current||(I.position.set(...q.position),I.rotation.set(...q.rotation),I.visible=q.visible&&a!=="sdf");const ie=e===q.id,be=I.material;be&&(be.wireframe=d==="wireframe",ie?(be.emissive=new mt(3900150),be.emissiveIntensity=.35):(be.emissive=new mt(0),be.emissiveIntensity=0)),ie&&Q&&l!=="select"&&Q.object!==I&&Q.attach(I)}!e&&Q&&Q.detach()},[s,e,d,a,l]);const B=j=>{const Q=O.current;Q.radius=Math.max(2,Math.min(80,Q.radius+j)),F()},P=()=>{O.current={radius:14,theta:Math.PI/4,phi:Math.PI/3.2},D.current.set(0,1,0),F()},A=()=>{if(!e)return;const j=M.current.get(e);j&&(D.current.copy(j.position),O.current.radius=Math.max(5,j.scale.length()*3),F())},H=j=>{N.current||(j.button===0?j.altKey?x.current=!0:ce(j):j.button===1||j.button===0&&j.shiftKey?L.current=!0:j.button===2&&(x.current=!0),w.current={x:j.clientX,y:j.clientY})},te=j=>{if(N.current)return;const Q=j.clientX-w.current.x,z=j.clientY-w.current.y;if(w.current={x:j.clientX,y:j.clientY},x.current){const X=O.current;X.theta-=Q*.007,X.phi=Math.max(.05,Math.min(Math.PI-.05,X.phi-z*.007)),F()}else if(L.current){if(!g.current)return;const X=g.current,q=new V,I=new V;X.matrix.extractBasis(q,I,new V);const ie=O.current.radius*.0015;D.current.addScaledVector(q,-Q*ie),D.current.addScaledVector(I,z*ie),F()}},J=()=>{x.current=!1,L.current=!1},oe=j=>{B(j.deltaY*.015)},ce=j=>{if(!h.current||!g.current||!m.current)return;const Q=h.current.getBoundingClientRect(),z=new ut((j.clientX-Q.left)/Q.width*2-1,-((j.clientY-Q.top)/Q.height)*2+1),X=new xx;X.setFromCamera(z,g.current);const q=Array.from(M.current.values()).filter(ie=>ie.visible),I=X.intersectObjects(q);if(I.length>0){const ie=I[0].object;t(ie.userData.id||null)}else t(null)};return S.jsxs("div",{ref:h,className:"relative w-full h-full cursor-grab active:cursor-grabbing outline-none select-none min-h-[400px] min-w-[400px]",onMouseDown:H,onMouseMove:te,onMouseUp:J,onWheel:oe,onContextMenu:j=>j.preventDefault(),children:[S.jsxs("div",{className:"absolute top-4 left-4 flex items-center gap-3 bg-studio-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-studio-700/60 text-xs text-slate-200 pointer-events-none shadow-xl",children:[S.jsx("span",{className:"w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"}),S.jsxs("span",{className:"font-bold tracking-wider uppercase text-blue-400",children:[a," Mode"]}),S.jsx("span",{className:"text-slate-600",children:"|"}),S.jsxs("span",{className:"font-mono text-[11px] text-slate-300",children:["Grid: ",S.jsx("strong",{children:"5x5 Cells"})]}),S.jsx("span",{className:"text-slate-600",children:"|"}),S.jsxs("span",{className:"text-[11px] text-slate-400",children:["Ruler: ",S.jsx("strong",{className:"text-red-400",children:"X"}),", ",S.jsx("strong",{className:"text-green-400",children:"Y"}),", ",S.jsx("strong",{className:"text-blue-400",children:"Z"})," 눈금 표시"]})]}),S.jsxs("div",{className:"absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-studio-900/90 backdrop-blur-md p-1.5 rounded-xl border border-studio-700/60 shadow-xl z-10",children:[S.jsxs("button",{onClick:()=>u&&u("translate"),className:`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${l==="translate"?"bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold":"text-slate-300 hover:bg-studio-800"}`,title:"도형 이동 (Move / Translate - W)",children:[S.jsx(pg,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"이동 (Move)"})]}),S.jsxs("button",{onClick:()=>u&&u("rotate"),className:`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${l==="rotate"?"bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold":"text-slate-300 hover:bg-studio-800"}`,title:"도형 회전 (Rotate - E)",children:[S.jsx(Sg,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"회전 (Rotate)"})]}),S.jsxs("button",{onClick:()=>u&&u("scale"),className:`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${l==="scale"?"bg-blue-600 text-white shadow-md shadow-blue-600/30 font-semibold":"text-slate-300 hover:bg-studio-800"}`,title:"도형 크기 조절 (Scale - R)",children:[S.jsx(k_,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"크기 (Scale)"})]})]}),S.jsxs("div",{className:"absolute right-4 top-4 flex flex-col gap-1.5 bg-studio-900/90 backdrop-blur-md p-1.5 rounded-xl border border-studio-700/60 shadow-xl z-10",children:[S.jsx("button",{onClick:()=>B(-2.5),className:"p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all group",title:"확대 (Zoom In - Wheel Up)",children:S.jsx(j_,{className:"w-4 h-4"})}),S.jsx("button",{onClick:()=>B(2.5),className:"p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all group",title:"축소 (Zoom Out - Wheel Down)",children:S.jsx(W_,{className:"w-4 h-4"})}),S.jsx("div",{className:"w-full h-px bg-studio-700/60 my-0.5"}),S.jsx("button",{onClick:A,className:"p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all",title:"선택된 도형으로 줌 포커스 (Focus Shape)",children:S.jsx(lg,{className:"w-4 h-4"})}),S.jsx("button",{onClick:P,className:"p-2 rounded-lg bg-studio-800 hover:bg-blue-600 text-slate-200 hover:text-white transition-all",title:"카메라 시점 초기화 (Reset View)",children:S.jsx(F_,{className:"w-4 h-4"})}),S.jsx("button",{onClick:()=>y(!b),className:`p-2 rounded-lg transition-all ${b?"bg-emerald-600 text-white shadow-md shadow-emerald-600/30":"bg-studio-800 text-slate-200 hover:bg-studio-700"}`,title:"도형 자동 움직임 / 턴테이블 애니메이션",children:b?S.jsx(Lf,{className:"w-4 h-4"}):S.jsx(fa,{className:"w-4 h-4 fill-current"})})]}),S.jsxs("div",{className:"absolute bottom-4 left-4 bg-studio-950/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-studio-800 text-[11px] text-slate-400 pointer-events-none flex items-center gap-2",children:[S.jsx(Y0,{className:"w-3.5 h-3.5 text-blue-400"}),S.jsxs("span",{children:["도형을 클릭하고 ",S.jsx("strong",{children:"빨강(X)/초록(Y)/파랑(Z) 축 기즈모"}),"를 드래그하여 자유롭게 이동하세요."]})]})]})},pT=({objects:s,selectedObject:e,onSelectObject:t,onUpdateObject:r,onDeleteObject:a,shading:l,onChangeShading:u,tool:d,onChangeTool:h})=>S.jsxs("aside",{className:"w-72 bg-studio-900 border-l border-studio-800 flex flex-col h-full z-20 select-none",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsx("div",{className:"flex items-center gap-1 bg-studio-950 p-1 rounded-lg border border-studio-800",children:["solid","wireframe","rendered"].map(m=>S.jsx("button",{onClick:()=>u(m),className:`px-2 py-0.5 rounded text-[11px] font-medium capitalize transition-all ${l===m?"bg-studio-800 text-blue-400 shadow-sm":"text-slate-400 hover:text-slate-200"}`,children:m},m))}),S.jsx("div",{className:"flex items-center gap-1 bg-studio-950 p-1 rounded-lg border border-studio-800",children:["select","translate","rotate","scale"].map(m=>S.jsxs("button",{onClick:()=>h(m),className:`p-1 rounded text-slate-400 hover:text-slate-200 transition-all ${d===m?"bg-studio-800 text-blue-400 shadow-sm":""}`,title:m.toUpperCase(),children:[m==="translate"&&S.jsx(pg,{className:"w-3.5 h-3.5"}),m==="rotate"&&S.jsx(Sg,{className:"w-3.5 h-3.5"}),m==="scale"&&S.jsx(L_,{className:"w-3.5 h-3.5"}),m==="select"&&S.jsx(Od,{className:"w-3.5 h-3.5"})]},m))})]}),S.jsxs("div",{className:"flex-1 flex flex-col overflow-hidden",children:[S.jsxs("div",{className:"flex-1 min-h-[160px] border-b border-studio-800/80 flex flex-col",children:[S.jsxs("div",{className:"px-3 py-2 text-xs font-semibold text-slate-300 flex items-center justify-between bg-studio-950/40",children:[S.jsxs("span",{className:"flex items-center gap-1.5",children:[S.jsx(Nf,{className:"w-3.5 h-3.5 text-blue-400"}),"Scene Outliner"]}),S.jsxs("span",{className:"text-[10px] text-slate-500 font-mono",children:["(",s.length,")"]})]}),S.jsx("div",{className:"flex-1 overflow-y-auto p-2 space-y-1",children:s.map(m=>{const g=e?.id===m.id;return S.jsxs("div",{onClick:()=>t(m.id),className:`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-all ${g?"bg-blue-600/20 border border-blue-500/40 text-blue-200 font-medium":"hover:bg-studio-800/80 text-slate-300 border border-transparent"}`,children:[S.jsxs("div",{className:"flex items-center gap-2 truncate",children:[S.jsx("div",{className:"w-2.5 h-2.5 rounded-full flex-shrink-0",style:{backgroundColor:m.color}}),S.jsx("span",{className:"truncate",children:m.name})]}),S.jsxs("div",{className:"flex items-center gap-1",onClick:_=>_.stopPropagation(),children:[S.jsx("button",{onClick:()=>r({...m,visible:!m.visible}),className:"p-1 hover:bg-studio-700/60 rounded text-slate-400 hover:text-slate-200",children:m.visible?S.jsx(b_,{className:"w-3 h-3"}):S.jsx(T_,{className:"w-3 h-3 text-slate-600"})}),S.jsx("button",{onClick:()=>a(m.id),className:"p-1 hover:bg-rose-950/40 rounded text-slate-400 hover:text-rose-400",children:S.jsx(H_,{className:"w-3 h-3"})})]})]},m.id)})})]}),S.jsx("div",{className:"flex-1 overflow-y-auto p-3 space-y-4",children:e?S.jsxs(S.Fragment,{children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-semibold text-slate-300 block mb-2",children:"Transform"}),S.jsxs("div",{className:"space-y-2 bg-studio-950 p-2.5 rounded-lg border border-studio-800 text-xs",children:[S.jsxs("div",{children:[S.jsx("span",{className:"text-[11px] text-slate-400 block mb-1",children:"Position (X, Y, Z)"}),S.jsx("div",{className:"grid grid-cols-3 gap-1",children:["X","Y","Z"].map((m,g)=>S.jsxs("div",{className:"flex items-center bg-studio-900 rounded border border-studio-800 px-1.5",children:[S.jsx("span",{className:"text-[10px] text-slate-500 font-mono mr-1",children:m}),S.jsx("input",{type:"number",step:"0.1",value:e.position[g],onChange:_=>{const v=[...e.position];v[g]=parseFloat(_.target.value)||0,r({...e,position:v})},className:"w-full bg-transparent text-slate-200 text-xs py-0.5 focus:outline-none"})]},m))})]}),S.jsxs("div",{children:[S.jsx("span",{className:"text-[11px] text-slate-400 block mb-1",children:"Scale (X, Y, Z)"}),S.jsx("div",{className:"grid grid-cols-3 gap-1",children:["X","Y","Z"].map((m,g)=>S.jsxs("div",{className:"flex items-center bg-studio-900 rounded border border-studio-800 px-1.5",children:[S.jsx("span",{className:"text-[10px] text-slate-500 font-mono mr-1",children:m}),S.jsx("input",{type:"number",step:"0.1",min:"0.01",value:e.scale[g],onChange:_=>{const v=[...e.scale];v[g]=parseFloat(_.target.value)||.1,r({...e,scale:v})},className:"w-full bg-transparent text-slate-200 text-xs py-0.5 focus:outline-none"})]},m))})]})]})]}),S.jsxs("div",{children:[S.jsxs("label",{className:"text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5",children:[S.jsx(gg,{className:"w-3.5 h-3.5 text-blue-400"}),"PBR Material"]}),S.jsxs("div",{className:"bg-studio-950 p-2.5 rounded-lg border border-studio-800 space-y-2.5 text-xs",children:[S.jsxs("div",{className:"flex items-center justify-between",children:[S.jsx("span",{className:"text-slate-400",children:"Base Color"}),S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx("input",{type:"color",value:e.color,onChange:m=>r({...e,color:m.target.value}),className:"w-6 h-6 rounded cursor-pointer border-0 bg-transparent"}),S.jsx("span",{className:"font-mono text-slate-300 text-[11px]",children:e.color})]})]}),S.jsxs("div",{children:[S.jsxs("div",{className:"flex justify-between text-[11px] text-slate-400 mb-1",children:[S.jsx("span",{children:"Roughness"}),S.jsx("span",{className:"font-mono text-slate-300",children:e.roughness.toFixed(2)})]}),S.jsx("input",{type:"range",min:"0",max:"1",step:"0.05",value:e.roughness,onChange:m=>r({...e,roughness:parseFloat(m.target.value)}),className:"w-full accent-blue-500 cursor-pointer"})]}),S.jsxs("div",{children:[S.jsxs("div",{className:"flex justify-between text-[11px] text-slate-400 mb-1",children:[S.jsx("span",{children:"Metalness"}),S.jsx("span",{className:"font-mono text-slate-300",children:e.metalness.toFixed(2)})]}),S.jsx("input",{type:"range",min:"0",max:"1",step:"0.05",value:e.metalness,onChange:m=>r({...e,metalness:parseFloat(m.target.value)}),className:"w-full accent-blue-500 cursor-pointer"})]})]})]})]}):S.jsxs("div",{className:"h-full flex flex-col items-center justify-center text-center p-4 text-slate-500 text-xs",children:[S.jsx(Od,{className:"w-8 h-8 mb-2 stroke-1 opacity-50"}),S.jsx("p",{children:"Select an object in the 3D viewport or outliner to view its properties."})]})})]})]}),mT=({objectCount:s})=>{const[e,t]=nt.useState(!1),[r,a]=nt.useState(0);return S.jsxs("footer",{className:"h-10 bg-studio-950 border-t border-studio-800 flex items-center justify-between px-3 text-xs text-slate-400 select-none z-30",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsxs("div",{className:"flex items-center gap-1 bg-studio-900 px-2 py-0.5 rounded border border-studio-800",children:[S.jsx("button",{onClick:()=>a(0),className:"p-1 hover:text-white",title:"Start",children:S.jsx(z_,{className:"w-3 h-3"})}),S.jsx("button",{onClick:()=>t(!e),className:"p-1 hover:text-white text-blue-400",title:"Play / Pause",children:e?S.jsx(Lf,{className:"w-3 h-3"}):S.jsx(fa,{className:"w-3 h-3 fill-current"})}),S.jsx("button",{onClick:()=>a(l=>Math.min(120,l+1)),className:"p-1 hover:text-white",title:"Step",children:S.jsx(B_,{className:"w-3 h-3"})}),S.jsxs("span",{className:"font-mono text-[11px] text-slate-300 ml-1",children:["Frame: ",r," / 120"]})]}),S.jsx("div",{className:"hidden md:flex items-center gap-1 bg-studio-900 h-5 px-2 rounded border border-studio-800/80 w-64",children:S.jsx("div",{className:"h-2 bg-blue-500 rounded-full transition-all",style:{width:`${r/120*100}%`}})})]}),S.jsxs("div",{className:"flex items-center gap-3",children:[S.jsxs("span",{className:"flex items-center gap-1 text-[11px] text-slate-400",children:[S.jsx(rc,{className:"w-3 h-3 text-blue-400"}),S.jsxs("span",{children:["Objects: ",S.jsx("strong",{children:s})]})]}),S.jsxs("span",{className:"hidden sm:flex items-center gap-1 text-[11px] text-slate-400",children:[S.jsx(uc,{className:"w-3 h-3 text-emerald-400"}),S.jsxs("span",{children:["Rust Kernel: ",S.jsx("strong",{className:"text-emerald-400",children:"Active (v0.1)"})]})]}),S.jsx("span",{className:"text-[11px] text-slate-400",children:"60 FPS (WebGPU Ready)"})]}),S.jsxs("div",{className:"flex items-center gap-2 text-[11px] text-slate-500 font-mono",children:[S.jsx("span",{children:"Tauri 2.0 / WASM"}),S.jsx("span",{className:"w-1.5 h-1.5 rounded-full bg-emerald-500"})]})]})},z0={basic:`// Basic OpenSCAD Primitives
cube([2, 2, 2]);
translate([3, 0, 0]) sphere(r = 1.2);
translate([-3, 0, 0]) cylinder(h = 2.5, r = 1);
`,csgCut:`// CSG Boolean Cutout Example
cube([3, 3, 3]);
translate([0, 1.5, 0]) sphere(r = 1.8);
translate([0, 0, 3]) cylinder(h = 2, r = 0.8);
`,bracket:`// Mechanical Bracket CAD
cube([4, 1, 3]);
translate([0, 2, 0]) cube([4, 1, 1]);
translate([0, 0.5, 2.5]) cylinder(h = 2, r = 0.5);
`},gT=({onRunCode:s})=>{const[e,t]=nt.useState(z0.basic),[r,a]=nt.useState(!1),l=()=>{s(e)},u=()=>{navigator.clipboard.writeText(e),a(!0),setTimeout(()=>a(!1),1500)};return S.jsxs("div",{className:"w-96 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(A_,{className:"w-4 h-4 text-amber-500"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"OpenSCAD Editor"})]}),S.jsxs("div",{className:"flex items-center gap-1",children:[S.jsx("button",{onClick:u,className:"p-1 hover:bg-studio-800 rounded text-slate-400 hover:text-slate-200",title:"Copy Code",children:r?S.jsx(__,{className:"w-3.5 h-3.5 text-emerald-400"}):S.jsx(E_,{className:"w-3.5 h-3.5"})}),S.jsxs("button",{onClick:l,className:"flex items-center gap-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium shadow-sm transition-all",children:[S.jsx(fa,{className:"w-3 h-3 fill-current"}),S.jsx("span",{children:"Compile (F5)"})]})]})]}),S.jsxs("div",{className:"px-3 py-2 border-b border-studio-800/60 bg-studio-950/40 flex items-center gap-2",children:[S.jsx("span",{className:"text-[11px] text-slate-400",children:"Presets:"}),S.jsxs("select",{onChange:d=>{const h=z0[d.target.value];h&&(t(h),s(h))},className:"bg-studio-800 text-slate-200 text-xs rounded px-2 py-1 border border-studio-700/60 focus:outline-none focus:border-amber-500",children:[S.jsx("option",{value:"basic",children:"Basic Primitives"}),S.jsx("option",{value:"csgCut",children:"CSG Difference Cut"}),S.jsx("option",{value:"bracket",children:"Mechanical Bracket"})]})]}),S.jsx("div",{className:"flex-1 p-2 relative font-mono text-xs",children:S.jsx("textarea",{value:e,onChange:d=>{t(d.target.value),s(d.target.value)},className:"w-full h-full bg-studio-950 text-amber-200 p-3 rounded-lg border border-studio-800 focus:outline-none focus:border-amber-500/50 resize-none font-mono text-xs leading-relaxed",spellCheck:!1,placeholder:`// Type OpenSCAD code here...
cube([2, 2, 2]);
translate([3, 0, 0]) sphere(r=1);`})}),S.jsxs("div",{className:"p-3 bg-studio-950/60 border-t border-studio-800 text-[11px] text-slate-400 space-y-1",children:[S.jsx("div",{className:"font-semibold text-slate-300",children:"Quick Syntax:"}),S.jsxs("div",{children:[S.jsx("code",{className:"text-amber-400",children:"cube([x, y, z]);"})," - Box primitive"]}),S.jsxs("div",{children:[S.jsx("code",{className:"text-amber-400",children:"sphere(r = radius);"})," - Sphere"]}),S.jsxs("div",{children:[S.jsx("code",{className:"text-amber-400",children:"cylinder(h = 10, r = 2);"})," - Cylinder"]}),S.jsxs("div",{children:[S.jsx("code",{className:"text-amber-400",children:"translate([x, y, z])"})," - Move"]})]})]})},xT=({onAddSdfPrimitive:s})=>{const[e,t]=nt.useState(.6),[r,a]=nt.useState("clay");return S.jsxs("div",{className:"w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(kd,{className:"w-4 h-4 text-rose-500 fill-rose-500/20"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"Womp Liquid Clay (SDF)"})]}),S.jsx("span",{className:"text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded font-mono",children:"Real-time"})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Add Clay Shape"}),S.jsxs("div",{className:"grid grid-cols-3 gap-2",children:[S.jsxs("button",{onClick:()=>s("sphere","smooth-union"),className:"flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group",children:[S.jsx("div",{className:"w-6 h-6 rounded-full bg-rose-500/30 group-hover:bg-rose-500/50 mb-1 flex items-center justify-center",children:S.jsx("span",{className:"text-[10px] text-rose-300",children:"●"})}),S.jsx("span",{children:"Blob"})]}),S.jsxs("button",{onClick:()=>s("box","smooth-union"),className:"flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group",children:[S.jsx("div",{className:"w-6 h-6 rounded bg-rose-500/30 group-hover:bg-rose-500/50 mb-1 flex items-center justify-center",children:S.jsx("span",{className:"text-[10px] text-rose-300",children:"■"})}),S.jsx("span",{children:"Clay Box"})]}),S.jsxs("button",{onClick:()=>s("torus","smooth-union"),className:"flex flex-col items-center justify-center p-2.5 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 transition-all group",children:[S.jsx("div",{className:"w-6 h-6 rounded-full border-2 border-rose-500/50 mb-1 flex items-center justify-center",children:S.jsx("span",{className:"text-[8px] text-rose-300",children:"○"})}),S.jsx("span",{children:"Donut"})]})]})]}),S.jsxs("div",{className:"bg-studio-950 p-3 rounded-lg border border-studio-800",children:[S.jsxs("div",{className:"flex justify-between items-center mb-1 text-xs",children:[S.jsxs("span",{className:"text-slate-300 flex items-center gap-1.5",children:[S.jsx(Od,{className:"w-3.5 h-3.5 text-rose-400"}),"Liquid Smoothness (smin)"]}),S.jsx("span",{className:"font-mono text-rose-400",children:e.toFixed(2)})]}),S.jsx("input",{type:"range",min:"0.05",max:"1.5",step:"0.05",value:e,onChange:l=>t(parseFloat(l.target.value)),className:"w-full accent-rose-500 cursor-pointer"}),S.jsxs("div",{className:"flex justify-between text-[10px] text-slate-500 mt-1",children:[S.jsx("span",{children:"Sharp Edges (0.05)"}),S.jsx("span",{children:"Liquid Melt (1.5)"})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Carve / Negative Clay"}),S.jsxs("button",{onClick:()=>s("sphere","subtract"),className:"w-full flex items-center justify-center gap-2 py-2 bg-studio-800 hover:bg-rose-950/40 border border-studio-700 hover:border-rose-500/40 rounded-lg text-xs text-rose-300 transition-all",children:[S.jsx(kd,{className:"w-3.5 h-3.5 rotate-180"}),S.jsx("span",{children:"Subtract / Carve Cavity"})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Clay Material"}),S.jsx("div",{className:"grid grid-cols-2 gap-2",children:[{id:"clay",name:"Terracotta",color:"#e07a5f"},{id:"ceramic",name:"White Ceramic",color:"#f4f1de"},{id:"slime",name:"Toxic Slime",color:"#81b29a"},{id:"gold",name:"Liquid Gold",color:"#f2cc8f"}].map(l=>S.jsxs("button",{onClick:()=>a(l.id),className:`flex items-center gap-2 p-2 rounded-lg border text-xs text-left transition-all ${r===l.id?"border-rose-500 bg-rose-500/10 text-white":"border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700"}`,children:[S.jsx("div",{className:"w-3.5 h-3.5 rounded-full shadow-inner",style:{backgroundColor:l.color}}),S.jsx("span",{children:l.name})]},l.id))})]}),S.jsxs("div",{className:"p-3 bg-rose-950/20 border border-rose-900/30 rounded-lg text-[11px] text-rose-200/80 leading-relaxed",children:[S.jsx("strong",{children:"Womp-style Modeling:"}),S.jsx("p",{className:"mt-1",children:"Shapes exist as mathematical distance fields (SDF). When two shapes get close, they smoothly melt and blend together automatically like real clay or liquid mercury!"})]})]})]})},vT=({onAddBox:s})=>{const[e,t]=nt.useState("#4ade80"),r=["#f87171","#fb923c","#facc15","#4ade80","#2dd4bf","#38bdf8","#818cf8","#c084fc","#f472b6","#ffffff","#94a3b8","#334155","#1e293b","#78350f","#b45309","#15803d","#1e40af"];return S.jsxs("div",{className:"w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(rc,{className:"w-4 h-4 text-emerald-500"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"Blockbench Box & UV"})]}),S.jsx("span",{className:"text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono",children:"Low-Poly"})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Add Element / Bone"}),S.jsxs("div",{className:"grid grid-cols-2 gap-2",children:[S.jsxs("button",{onClick:()=>s("Head",[-1,1.5,-1],[1,3.5,1],e),className:"p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2",children:[S.jsx("div",{className:"w-3.5 h-3.5 bg-emerald-500 rounded-sm"}),S.jsx("span",{children:"Head (2x2x2)"})]}),S.jsxs("button",{onClick:()=>s("Torso",[-1,-.5,-.5],[1,1.5,.5],e),className:"p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2",children:[S.jsx("div",{className:"w-3.5 h-3.5 bg-cyan-500 rounded-sm"}),S.jsx("span",{children:"Torso (2x2x1)"})]}),S.jsxs("button",{onClick:()=>s("Arm_L",[1.2,-.5,-.5],[1.8,1.5,.5],e),className:"p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2",children:[S.jsx("div",{className:"w-3.5 h-3.5 bg-indigo-500 rounded-sm"}),S.jsx("span",{children:"Arm / Limb"})]}),S.jsxs("button",{onClick:()=>s("Weapon",[-.2,0,-2],[.2,.5,2],e),className:"p-2 bg-studio-800 hover:bg-studio-700 border border-studio-700/60 rounded-lg text-xs text-slate-200 flex items-center gap-2",children:[S.jsx("div",{className:"w-3.5 h-3.5 bg-amber-500 rounded-sm"}),S.jsx("span",{children:"Sword / Prop"})]})]})]}),S.jsxs("div",{children:[S.jsxs("label",{className:"text-xs font-medium text-slate-300 block mb-2 flex items-center justify-between",children:[S.jsxs("span",{className:"flex items-center gap-1.5",children:[S.jsx(gg,{className:"w-3.5 h-3.5 text-emerald-400"}),"Pixel Palette (16-Color)"]}),S.jsx("div",{className:"w-4 h-4 rounded border border-studio-600",style:{backgroundColor:e}})]}),S.jsx("div",{className:"grid grid-cols-6 gap-1.5 bg-studio-950 p-2.5 rounded-lg border border-studio-800",children:r.map(a=>S.jsx("button",{onClick:()=>t(a),style:{backgroundColor:a},className:`w-full aspect-square rounded transition-transform ${e===a?"scale-110 ring-2 ring-white shadow-lg":"hover:scale-105"}`},a))})]}),S.jsxs("div",{className:"bg-studio-950 p-3 rounded-lg border border-studio-800",children:[S.jsxs("div",{className:"flex items-center justify-between text-xs mb-2",children:[S.jsxs("span",{className:"text-slate-300 flex items-center gap-1.5",children:[S.jsx(P_,{className:"w-3.5 h-3.5 text-emerald-400"}),"Texture Resolution"]}),S.jsx("span",{className:"font-mono text-emerald-400",children:"16 x 16 px"})]}),S.jsx("div",{className:"flex gap-2",children:["16x","32x","64x"].map(a=>S.jsx("button",{className:"flex-1 py-1 text-xs bg-studio-800 hover:bg-studio-700 rounded text-slate-300 border border-studio-700/50",children:a},a))})]}),S.jsxs("div",{className:"p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-[11px] text-emerald-200/80 leading-relaxed",children:[S.jsx("strong",{children:"Blockbench Low-Poly:"}),S.jsx("p",{className:"mt-1",children:"Build game-ready box meshes with pixel-perfect UV mapping. Ideal for Minecraft mods, indie low-poly games, and retro 3D aesthetics."})]})]})]})},_T=({onGenerateAiModel:s})=>{const[e,t]=nt.useState("Cyberpunk sci-fi energy reactor core with glowing rings"),[r,a]=nt.useState("stylized"),[l,u]=nt.useState(!1),[d,h]=nt.useState(""),m=()=>{u(!0),setTimeout(()=>{s(e,r),u(!1)},1800)};return S.jsxs("div",{className:"w-84 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(zd,{className:"w-4 h-4 text-purple-400"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"Meshy AI 3D Studio"})]}),S.jsx("span",{className:"text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono",children:"AI Gen"})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsxs("label",{className:"text-xs font-medium text-slate-300 block mb-1.5 flex items-center gap-1.5",children:[S.jsx(V_,{className:"w-3.5 h-3.5 text-purple-400"}),"Prompt (Text-to-3D)"]}),S.jsx("textarea",{value:e,onChange:g=>t(g.target.value),rows:3,className:"w-full bg-studio-950 text-slate-200 text-xs p-2.5 rounded-lg border border-studio-800 focus:outline-none focus:border-purple-500/60 resize-none",placeholder:"Describe the 3D model you want to generate..."})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-1.5",children:"Art Style"}),S.jsx("div",{className:"grid grid-cols-2 gap-2",children:[{id:"realistic",label:"Realistic PBR"},{id:"stylized",label:"Cartoon Stylized"},{id:"lowpoly",label:"Low-Poly / Game"},{id:"sculpt",label:"Clay Sculpt"}].map(g=>S.jsx("button",{onClick:()=>a(g.id),className:`py-2 px-2.5 rounded-lg border text-xs text-left transition-all ${r===g.id?"border-purple-500 bg-purple-500/15 text-purple-200 font-medium":"border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700"}`,children:g.label},g.id))})]}),S.jsx("button",{onClick:m,disabled:l||!e.trim(),className:"w-full py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-purple-600/25 flex items-center justify-center gap-2 transition-all disabled:opacity-50",children:l?S.jsxs(S.Fragment,{children:[S.jsx(N_,{className:"w-4 h-4 animate-spin"}),S.jsx("span",{children:"Generating 3D Neural Mesh..."})]}):S.jsxs(S.Fragment,{children:[S.jsx(zd,{className:"w-4 h-4"}),S.jsx("span",{children:"Generate 3D Model"})]})}),S.jsxs("div",{className:"bg-studio-950 p-3 rounded-lg border border-studio-800/80 space-y-2",children:[S.jsxs("div",{className:"flex items-center justify-between text-[11px] text-slate-400",children:[S.jsxs("span",{className:"flex items-center gap-1",children:[S.jsx(uc,{className:"w-3 h-3 text-purple-400"}),"API Provider"]}),S.jsx("span",{className:"text-purple-400 font-mono",children:"Meshy / Tripo3D"})]}),S.jsx("input",{type:"password",value:d,onChange:g=>h(g.target.value),placeholder:"Enter API Key (Optional for preview)...",className:"w-full bg-studio-900 text-slate-300 text-xs px-2.5 py-1.5 rounded border border-studio-800 focus:outline-none focus:border-purple-500/50"})]}),S.jsxs("div",{className:"p-3 bg-purple-950/20 border border-purple-900/30 rounded-lg text-[11px] text-purple-200/80 leading-relaxed",children:[S.jsx("strong",{children:"AI 3D Synthesis:"}),S.jsx("p",{className:"mt-1",children:"Generate complex organic meshes, quad-topology game characters, and 4K PBR texture maps using generative AI diffusion models."})]})]})]})},yT=({onSubdivide:s,onExtrude:e})=>{const[t,r]=nt.useState("face"),[a,l]=nt.useState("grab"),u=[{id:"grab",name:"Grab / Move",icon:"✋"},{id:"smooth",name:"Smooth Relax",icon:"🌊"},{id:"inflate",name:"Inflate",icon:"🎈"},{id:"flatten",name:"Flatten",icon:"📏"},{id:"crease",name:"Crease Sharp",icon:"⚡"},{id:"pinch",name:"Pinch Pull",icon:"🤏"}];return S.jsxs("div",{className:"w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(Nf,{className:"w-4 h-4 text-orange-500"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"Blender Mesh & Sculpt"})]}),S.jsx("span",{className:"text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-mono",children:"B-Mesh"})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Edit Mode Element"}),S.jsxs("div",{className:"grid grid-cols-3 gap-2 bg-studio-950 p-1 rounded-lg border border-studio-800",children:[S.jsxs("button",{onClick:()=>r("vertex"),className:`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${t==="vertex"?"bg-orange-600 text-white shadow-sm":"text-slate-400 hover:text-slate-200"}`,children:[S.jsx(y_,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"Vertex"})]}),S.jsxs("button",{onClick:()=>r("edge"),className:`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${t==="edge"?"bg-orange-600 text-white shadow-sm":"text-slate-400 hover:text-slate-200"}`,children:[S.jsx(D_,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"Edge"})]}),S.jsxs("button",{onClick:()=>r("face"),className:`flex items-center justify-center gap-1.5 py-1.5 rounded text-xs transition-all ${t==="face"?"bg-orange-600 text-white shadow-sm":"text-slate-400 hover:text-slate-200"}`,children:[S.jsx(Rg,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"Face"})]})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Mesh Operations"}),S.jsxs("div",{className:"grid grid-cols-2 gap-2",children:[S.jsxs("button",{onClick:e,className:"p-2 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 flex items-center gap-2",children:[S.jsx(lg,{className:"w-3.5 h-3.5 text-orange-400"}),S.jsx("span",{children:"Extrude (E)"})]}),S.jsxs("button",{onClick:s,className:"p-2 bg-studio-800 hover:bg-studio-700/80 rounded-lg border border-studio-700/40 text-xs text-slate-200 flex items-center gap-2",children:[S.jsx(O_,{className:"w-3.5 h-3.5 text-orange-400"}),S.jsx("span",{children:"Subdivide"})]})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Sculpting Brushes"}),S.jsx("div",{className:"grid grid-cols-2 gap-2",children:u.map(d=>S.jsxs("button",{onClick:()=>l(d.id),className:`p-2.5 rounded-lg border text-xs text-left flex items-center gap-2 transition-all ${a===d.id?"border-orange-500 bg-orange-500/15 text-orange-200 font-medium":"border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700"}`,children:[S.jsx("span",{className:"text-base",children:d.icon}),S.jsx("span",{children:d.name})]},d.id))})]}),S.jsxs("div",{className:"bg-studio-950 p-3 rounded-lg border border-studio-800 space-y-2",children:[S.jsxs("div",{className:"flex justify-between text-xs text-slate-300",children:[S.jsx("span",{children:"Brush Radius"}),S.jsx("span",{className:"font-mono text-orange-400",children:"45 px"})]}),S.jsx("input",{type:"range",min:"10",max:"150",defaultValue:"45",className:"w-full accent-orange-500 cursor-pointer"}),S.jsxs("div",{className:"flex justify-between text-xs text-slate-300 pt-1",children:[S.jsx("span",{children:"Brush Strength"}),S.jsx("span",{className:"font-mono text-orange-400",children:"0.50"})]}),S.jsx("input",{type:"range",min:"0.05",max:"1.0",step:"0.05",defaultValue:"0.5",className:"w-full accent-orange-500 cursor-pointer"})]})]})]})},ST=()=>{const[s,e]=nt.useState(!1),[t,r]=nt.useState(9.8),[a,l]=nt.useState(.7);return S.jsxs("div",{className:"w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(G_,{className:"w-4 h-4 text-cyan-400"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"Spline Interactive 3D"})]}),S.jsxs("button",{onClick:()=>e(!s),className:`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${s?"bg-emerald-600 text-white shadow-sm":"bg-studio-800 text-slate-300 hover:bg-studio-700"}`,children:[s?S.jsx(Lf,{className:"w-3 h-3"}):S.jsx(fa,{className:"w-3 h-3 fill-current"}),S.jsx("span",{children:s?"Pause Sim":"Play Sim"})]})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Interactivity & Triggers"}),S.jsx("div",{className:"space-y-1.5",children:[{event:"Mouse Hover",action:"Scale up 1.1x & glow"},{event:"Mouse Click",action:"Trigger jump impulse"},{event:"Scroll Drag",action:"Parallax camera tilt"}].map((u,d)=>S.jsxs("div",{className:"bg-studio-950 p-2.5 rounded-lg border border-studio-800 flex items-center justify-between text-xs",children:[S.jsxs("div",{children:[S.jsx("div",{className:"font-medium text-cyan-300",children:u.event}),S.jsx("div",{className:"text-[11px] text-slate-400",children:u.action})]}),S.jsx("span",{className:"text-[10px] bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/40",children:"Active"})]},d))})]}),S.jsxs("div",{className:"bg-studio-950 p-3 rounded-lg border border-studio-800 space-y-3",children:[S.jsxs("div",{className:"text-xs font-semibold text-slate-200 flex items-center gap-1.5",children:[S.jsx(U_,{className:"w-3.5 h-3.5 text-cyan-400"}),S.jsx("span",{children:"Rapier3D Physics Engine"})]}),S.jsxs("div",{children:[S.jsxs("div",{className:"flex justify-between text-xs text-slate-300 mb-1",children:[S.jsx("span",{children:"World Gravity (m/s²)"}),S.jsx("span",{className:"font-mono text-cyan-400",children:t})]}),S.jsx("input",{type:"range",min:"0",max:"20",step:"0.5",value:t,onChange:u=>r(parseFloat(u.target.value)),className:"w-full accent-cyan-500 cursor-pointer"})]}),S.jsxs("div",{children:[S.jsxs("div",{className:"flex justify-between text-xs text-slate-300 mb-1",children:[S.jsx("span",{children:"Restitution (Bounciness)"}),S.jsx("span",{className:"font-mono text-cyan-400",children:a})]}),S.jsx("input",{type:"range",min:"0",max:"1",step:"0.05",value:a,onChange:u=>l(parseFloat(u.target.value)),className:"w-full accent-cyan-500 cursor-pointer"})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"Web Embed & Sharing"}),S.jsx("div",{className:"bg-studio-950 p-2.5 rounded-lg border border-studio-800 text-[11px] font-mono text-slate-400 overflow-x-auto",children:S.jsx("code",{children:'<omni-3d-viewer src="/scene.gltf" interactive />'})})]})]})]})},MT=({onAddCadFeature:s})=>{const[e,t]=nt.useState("XY"),[r,a]=nt.useState(2.5),l=[{id:"1",name:"Sketch001 (Base Profile)",type:"Sketch (XY Plane)",status:"Fully Constrained"},{id:"2",name:"Pad001 (Extrusion 25mm)",type:"Feature: Pad",status:"Active"},{id:"3",name:"Pocket001 (Mount Hole)",type:"Feature: Cut",status:"Active"},{id:"4",name:"Fillet001 (Edge R2mm)",type:"Feature: Fillet",status:"Active"}];return S.jsxs("div",{className:"w-80 bg-studio-900 border-r border-studio-800 flex flex-col h-full z-20",children:[S.jsxs("div",{className:"h-11 border-b border-studio-800 px-3 flex items-center justify-between bg-studio-900",children:[S.jsxs("div",{className:"flex items-center gap-2",children:[S.jsx(uc,{className:"w-4 h-4 text-blue-500"}),S.jsx("span",{className:"text-xs font-semibold text-slate-200",children:"FreeCAD Parametric"})]}),S.jsx("span",{className:"text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-mono",children:"B-Rep"})]}),S.jsxs("div",{className:"p-3 space-y-4 flex-1 overflow-y-auto",children:[S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"New Sketch Plane"}),S.jsx("div",{className:"grid grid-cols-3 gap-2",children:["XY","XZ","YZ"].map(u=>S.jsxs("button",{onClick:()=>t(u),className:`py-1.5 rounded-lg border text-xs font-mono font-medium transition-all ${e===u?"border-blue-500 bg-blue-500/20 text-blue-300":"border-studio-800 bg-studio-950/60 text-slate-400 hover:border-studio-700"}`,children:[u," Plane"]},u))})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"2D Sketcher Tools"}),S.jsxs("div",{className:"grid grid-cols-3 gap-1.5 bg-studio-950 p-1.5 rounded-lg border border-studio-800",children:[S.jsxs("button",{className:"flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200",children:[S.jsx(Rg,{className:"w-3.5 h-3.5 text-blue-400"}),S.jsx("span",{children:"Rect"})]}),S.jsxs("button",{className:"flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200",children:[S.jsx(S_,{className:"w-3.5 h-3.5 text-blue-400"}),S.jsx("span",{children:"Circle"})]}),S.jsxs("button",{className:"flex items-center justify-center gap-1 p-2 bg-studio-800 hover:bg-studio-700 rounded text-xs text-slate-200",children:[S.jsx(Y0,{className:"w-3.5 h-3.5 text-blue-400"}),S.jsx("span",{children:"Line"})]})]})]}),S.jsxs("div",{children:[S.jsx("label",{className:"text-xs font-medium text-slate-300 block mb-2",children:"PartDesign Features"}),S.jsx("div",{className:"space-y-2",children:S.jsxs("div",{className:"bg-studio-950 p-2.5 rounded-lg border border-studio-800",children:[S.jsxs("div",{className:"flex justify-between items-center text-xs mb-1.5",children:[S.jsx("span",{className:"text-slate-300",children:"Pad / Extrude Length"}),S.jsxs("span",{className:"font-mono text-blue-400",children:[r," mm"]})]}),S.jsx("input",{type:"range",min:"0.5",max:"10",step:"0.5",value:r,onChange:u=>a(parseFloat(u.target.value)),className:"w-full accent-blue-500 cursor-pointer"}),S.jsxs("button",{onClick:()=>s("pad",r),className:"w-full mt-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-all",children:[S.jsx(v_,{className:"w-3.5 h-3.5"}),S.jsx("span",{children:"Apply Pad Extrusion"})]})]})})]}),S.jsxs("div",{children:[S.jsxs("label",{className:"text-xs font-medium text-slate-300 block mb-2 flex items-center gap-1.5",children:[S.jsx(C_,{className:"w-3.5 h-3.5 text-blue-400"}),"Parametric History Tree"]}),S.jsx("div",{className:"space-y-1 bg-studio-950 p-2 rounded-lg border border-studio-800",children:l.map((u,d)=>S.jsxs("div",{className:"p-2 rounded bg-studio-900 border border-studio-800/80 flex items-center justify-between text-xs",children:[S.jsxs("div",{children:[S.jsx("div",{className:"font-medium text-slate-200",children:u.name}),S.jsx("div",{className:"text-[10px] text-slate-400",children:u.type})]}),S.jsx("span",{className:"text-[9px] bg-blue-950 text-blue-400 px-1.5 py-0.5 rounded border border-blue-900",children:u.status})]},u.id))})]})]})]})};function ET(s){const e=[],t=s.split(`
`);let r=[0,0,0],a=[0,0,0],l=0;for(let u of t){if(u=u.trim(),!u||u.startsWith("//"))continue;const d=u.match(/translate\s*\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\)/);d&&(r=[parseFloat(d[1]),parseFloat(d[2]),parseFloat(d[3])]);const h=u.match(/cube\s*\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]/);if(h){l++;const _=parseFloat(h[1]),v=parseFloat(h[2]),M=parseFloat(h[3]);e.push({id:`scad-cube-${l}`,name:`OpenSCAD Cube ${l}`,type:"cube",position:[...r],rotation:[...a],scale:[_,v,M],color:"#f59e0b",roughness:.3,metalness:.1,visible:!0,locked:!1}),r=[0,0,0];continue}const m=u.match(/sphere\s*\(\s*(?:r\s*=\s*)?(-?[\d.]+)\s*\)/);if(m){l++;const _=parseFloat(m[1]);e.push({id:`scad-sphere-${l}`,name:`OpenSCAD Sphere ${l}`,type:"sphere",position:[...r],rotation:[...a],scale:[_*2,_*2,_*2],color:"#3b82f6",roughness:.2,metalness:.2,visible:!0,locked:!1}),r=[0,0,0];continue}const g=u.match(/cylinder\s*\(\s*(?:h\s*=\s*)?(-?[\d.]+)\s*,\s*(?:r\s*=\s*)?(-?[\d.]+)/);if(g){l++;const _=parseFloat(g[1]),v=parseFloat(g[2]);e.push({id:`scad-cylinder-${l}`,name:`OpenSCAD Cylinder ${l}`,type:"cylinder",position:[...r],rotation:[...a],scale:[v*2,_,v*2],color:"#10b981",roughness:.4,metalness:.1,visible:!0,locked:!1}),r=[0,0,0];continue}}return e}const wT=[{id:"obj-cube-1",name:"Main Cube",type:"cube",position:[0,1,0],rotation:[0,0,0],scale:[2,2,2],color:"#3b82f6",roughness:.3,metalness:.2,visible:!0,locked:!1},{id:"obj-sphere-1",name:"Accent Sphere",type:"sphere",position:[2.5,.75,0],rotation:[0,0,0],scale:[1.5,1.5,1.5],color:"#ec4899",roughness:.15,metalness:.8,visible:!0,locked:!1},{id:"obj-cyl-1",name:"Column Base",type:"cylinder",position:[-2.5,1,0],rotation:[0,0,0],scale:[1.6,2,1.6],color:"#10b981",roughness:.4,metalness:.1,visible:!0,locked:!1}],TT=()=>{const[s,e]=nt.useState("mesh"),[t,r]=nt.useState(wT),[a,l]=nt.useState("obj-cube-1"),[u,d]=nt.useState("solid"),[h,m]=nt.useState("translate"),g=t.find(w=>w.id===a)||null,_=w=>{const O=`obj-${w}-${Date.now()}`,D={id:O,name:`${w.charAt(0).toUpperCase()+w.slice(1)} ${t.length+1}`,type:w,position:[0,1,0],rotation:[0,0,0],scale:w==="sphere"?[1.5,1.5,1.5]:[2,2,2],color:"#6366f1",roughness:.3,metalness:.2,visible:!0,locked:!1};r(F=>[...F,D]),l(O)},v=w=>{r(O=>O.map(D=>D.id===w.id?w:D))},M=w=>{r(O=>O.filter(D=>D.id!==w)),a===w&&l(null)},T=w=>{const O=ET(w);O.length>0&&(r(O),l(O[0].id))},b=(w,O)=>{const D=`sdf-${w}-${Date.now()}`,F={id:D,name:`Clay ${w} (${O})`,type:w==="sphere"?"sphere":w==="box"?"cube":"torus",position:[(Math.random()-.5)*2,1,(Math.random()-.5)*2],rotation:[0,0,0],scale:[1.8,1.8,1.8],color:O==="subtract"?"#1e293b":"#e07a5f",roughness:.9,metalness:.05,visible:!0,locked:!1};r(B=>[...B,F]),l(D)},y=(w,O,D,F)=>{const B=`voxel-box-${Date.now()}`,P=D[0]-O[0],A=D[1]-O[1],H=D[2]-O[2],te={id:B,name:`Box: ${w}`,type:"cube",position:[(O[0]+D[0])/2,(O[1]+D[1])/2,(O[2]+D[2])/2],rotation:[0,0,0],scale:[Math.abs(P),Math.abs(A),Math.abs(H)],color:F,roughness:.8,metalness:.1,visible:!0,locked:!1};r(J=>[...J,te]),l(B)},x=(w,O)=>{const D=`cad-pad-${Date.now()}`,F={id:D,name:`CAD Pad (${O}mm)`,type:"cube",position:[0,O/2,0],rotation:[0,0,0],scale:[3,O,3],color:"#38bdf8",roughness:.25,metalness:.5,visible:!0,locked:!1};r(B=>[...B,F]),l(D)},L=(w,O)=>{const D=`ai-mesh-${Date.now()}`,F={id:D,name:`AI: ${w.slice(0,20)}...`,type:"torus",position:[0,1.5,0],rotation:[.3,.4,0],scale:[2.5,2.5,2.5],color:"#a855f7",roughness:.2,metalness:.7,visible:!0,locked:!1};r(B=>[...B,F]),l(D)},N=w=>{let O="",D="text/plain",F=`omni3d_model.${w}`;if(w==="scad")O=t.map(H=>{const[te,J,oe]=H.position,[ce,j,Q]=H.scale;return H.type==="cube"?`translate([${te}, ${J}, ${oe}]) cube([${ce}, ${j}, ${Q}], center=true);`:H.type==="sphere"?`translate([${te}, ${J}, ${oe}]) sphere(r=${ce/2});`:H.type==="cylinder"?`translate([${te}, ${J}, ${oe}]) cylinder(h=${j}, r=${ce/2}, center=true);`:""}).join(`
`);else if(w==="obj"){O=`# Omni3D Studio Wavefront OBJ Export
# Objects: ${t.length}
`;let H=1;for(const te of t){O+=`o ${te.name.replace(/\s+/g,"_")}
`;const[J,oe,ce]=te.position,[j,Q,z]=te.scale.map(q=>q/2);O+=`v ${J-j} ${oe-Q} ${ce-z}
`,O+=`v ${J+j} ${oe-Q} ${ce-z}
`,O+=`v ${J+j} ${oe+Q} ${ce-z}
`,O+=`v ${J-j} ${oe+Q} ${ce-z}
`,O+=`v ${J-j} ${oe-Q} ${ce+z}
`,O+=`v ${J+j} ${oe-Q} ${ce+z}
`,O+=`v ${J+j} ${oe+Q} ${ce+z}
`,O+=`v ${J-j} ${oe+Q} ${ce+z}
`;const X=H;O+=`f ${X} ${X+1} ${X+2} ${X+3}
`,O+=`f ${X+5} ${X+4} ${X+7} ${X+6}
`,O+=`f ${X+4} ${X} ${X+3} ${X+7}
`,O+=`f ${X+1} ${X+5} ${X+6} ${X+2}
`,O+=`f ${X+3} ${X+2} ${X+6} ${X+7}
`,O+=`f ${X+4} ${X+5} ${X+1} ${X}
`,H+=8}}else O=JSON.stringify({version:"1.0",format:w,objects:t},null,2),F="omni3d_scene.json";const B=new Blob([O],{type:D}),P=URL.createObjectURL(B),A=document.createElement("a");A.href=P,A.download=F,A.click(),URL.revokeObjectURL(P)};return S.jsxs("div",{className:"flex flex-col h-screen w-screen bg-studio-950 text-slate-100 overflow-hidden font-sans",children:[S.jsx(X_,{currentMode:s,onSelectMode:e,onExport:N,onAddPrimitive:_}),S.jsxs("div",{className:"flex flex-1 overflow-hidden relative",children:[s==="scad"&&S.jsx(gT,{onRunCode:T}),s==="sdf"&&S.jsx(xT,{onAddSdfPrimitive:b}),s==="voxel"&&S.jsx(vT,{onAddBox:y}),s==="ai"&&S.jsx(_T,{onGenerateAiModel:L}),s==="mesh"&&S.jsx(yT,{onSubdivide:()=>{g&&v({...g,scale:[g.scale[0]*1.05,g.scale[1]*1.05,g.scale[2]*1.05]})},onExtrude:()=>{g&&v({...g,scale:[g.scale[0],g.scale[1]*1.3,g.scale[2]]})}}),s==="interactive"&&S.jsx(ST,{}),s==="cad"&&S.jsx(MT,{onAddCadFeature:x}),S.jsx("main",{className:"flex-1 h-full relative overflow-hidden bg-gradient-to-b from-[#0b0e14] to-[#12161f]",children:S.jsx(hT,{objects:t,selectedId:a,onSelectObject:l,onUpdateTransform:(w,O,D,F)=>{r(B=>B.map(P=>P.id===w?{...P,position:O,rotation:D,scale:F}:P))},mode:s,tool:h,onChangeTool:m,shading:u})}),S.jsx(pT,{objects:t,selectedObject:g,onSelectObject:l,onUpdateObject:v,onDeleteObject:M,shading:u,onChangeShading:d,tool:h,onChangeTool:m})]}),S.jsx(mT,{objectCount:t.length})]})};a_.createRoot(document.getElementById("root")).render(S.jsx(e_.StrictMode,{children:S.jsx(TT,{})}));
