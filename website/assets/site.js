/*!
 * GSAP 3.15.1
 * https://gsap.com
 * 
 * @license Copyright 2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license.
 * @author: Jack Doyle, jack@greensock.com
 */

!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?e(exports):"function"==typeof define&&define.amd?define(["exports"],e):e((t=t||self).window=t.window||{})}(this,function(e){"use strict";function _inheritsLoose(t,e){t.prototype=Object.create(e.prototype),(t.prototype.constructor=t).__proto__=e}function _assertThisInitialized(t){if(void 0===t)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return t}function r(t){return"string"==typeof t}function s(t){return"function"==typeof t}function t(t){return"number"==typeof t}function u(t){return void 0===t}function v(t){return"object"==typeof t}function w(t){return!1!==t}function x(){return"undefined"!=typeof window}function y(t){return s(t)||r(t)}function R(t){return(i=bt(t,ht))&&Fe}function S(t,e){return console.warn("Invalid property",t,"set to",e,"Missing plugin? gsap.registerPlugin()")}function T(t,e){return!e&&console.warn(t)}function U(t,e){return t&&(ht[t]=e)&&i&&(i[t]=e)||ht}function V(){return 0}function ga(t){var e,r,i=t[0];if(v(i)||s(i)||(t=[t]),!(e=(i._gsap||{}).harness)){for(r=yt.length;r--&&!yt[r].targetTest(i););e=yt[r]}for(r=t.length;r--;)t[r]&&(t[r]._gsap||(t[r]._gsap=new qt(t[r],e)))||t.splice(r,1);return t}function ha(t){return t._gsap||ga(Pt(t))[0]._gsap}function ia(t,e,r){return(r=t[e])&&s(r)?t[e]():u(r)&&t.getAttribute&&t.getAttribute(e)||r}function ja(t,e){return(t=t.split(",")).forEach(e)||t}function ka(t){return Math.round(1e5*t)/1e5||0}function la(t){return Math.round(1e7*t)/1e7||0}function ma(t,e){var r=e.charAt(0),i=parseFloat(e.substr(2));return t=parseFloat(t),"+"===r?t+i:"-"===r?t-i:"*"===r?t*i:t/i}function na(t,e){for(var r=e.length,i=0;t.indexOf(e[i])<0&&++i<r;);return i<r}function oa(){var t,e,r=pt.length,i=pt.slice(0);for(_t={},t=pt.length=0;t<r;t++)(e=i[t])&&e._lazy&&(e.render(e._lazy[0],e._lazy[1],!0)._lazy=0)}function pa(t){return!!(t._initted||t._startAt||t.add)}function qa(t,e,r,i){pt.length&&!L&&oa(),t.render(e,r,i||!!(L&&e<0&&pa(t))),pt.length&&!L&&oa()}function ra(t){var e=parseFloat(t);return(e||0===e)&&(t+"").match(ot).length<2?e:r(t)?t.trim():t}function sa(t){return t}function ta(t,e){for(var r in e)r in t||(t[r]=e[r]);return t}function wa(t,e){for(var r in e)"__proto__"!==r&&"constructor"!==r&&"prototype"!==r&&(t[r]=v(e[r])?wa(t[r]||(t[r]={}),e[r]):e[r]);return t}function xa(t,e){var r,i={};for(r in t)r in e||(i[r]=t[r]);return i}function ya(t){var e=t.parent||I,r=t.keyframes?function _setKeyframeDefaults(i){return function(t,e){for(var r in e)r in t||"duration"===r&&i||"ease"===r||(t[r]=e[r])}}(K(t.keyframes)):ta;if(w(t.inherit))for(;e;)r(t,e.vars.defaults),e=e.parent||e._dp;return t}function Aa(t,e,r,i,n){void 0===r&&(r="_first"),void 0===i&&(i="_last");var a,s=t[i];if(n)for(a=e[n];s&&s[n]>a;)s=s._prev;return s?(e._next=s._next,s._next=e):(e._next=t[r],t[r]=e),e._next?e._next._prev=e:t[i]=e,e._prev=s,e.parent=e._dp=t,e}function Ba(t,e,r,i){void 0===r&&(r="_first"),void 0===i&&(i="_last");var n=e._prev,a=e._next;n?n._next=a:t[r]===e&&(t[r]=a),a?a._prev=n:t[i]===e&&(t[i]=n),e._next=e._prev=e.parent=null}function Ca(t,e){t.parent&&(!e||t.parent.autoRemoveChildren)&&t.parent.remove&&t.parent.remove(t),t._act=0}function Da(t,e){if(t&&(!e||e._end>t._dur||e._start<0))for(var r=t;r;)r._dirty=1,r=r.parent;return t}function Fa(t,e,r,i){return t._startAt&&(L?t._startAt.revert(ft):t.vars.immediateRender&&!t.vars.autoRevert||t._startAt.render(e,!0,i))}function Ha(t){return t._repeat?wt(t._tTime,t=t.duration()+t._rDelay)*t:0}function Ja(t,e){return(t-e._start)*e._ts+(0<=e._ts?0:e._dirty?e.totalDuration():e._tDur)}function Ka(t){return t._end=la(t._start+(t._tDur/Math.abs(t._ts||t._rts||X)||0))}function La(t,e){var r=t._dp;return r&&r.smoothChildTiming&&t._ts&&(t._start=la(r._time-(0<t._ts?e/t._ts:((t._dirty?t.totalDuration():t._tDur)-e)/-t._ts)),Ka(t),r._dirty||Da(r,t)),t}function Ma(t,e){var r;if((e._time||!e._dur&&e._initted||e._start<t._time&&(e._dur||!e.add))&&(r=Ja(t.rawTime(),e),(!e._dur||Mt(0,e.totalDuration(),r)-e._tTime>X)&&e.render(r,!0)),Da(t,e)._dp&&t._initted&&t._time>=t._dur&&t._ts){if(t._dur<t.duration())for(r=t;r._dp;)0<=r.rawTime()&&r.totalTime(r._tTime),r=r._dp;t._zTime=-X}}function Na(e,r,i,n){return r.parent&&Ca(r),r._start=la((t(i)?i:!i&&xt(r)&&(!e._last||e._last._start>=e._time)?e._last?e._last._start:e._time:i||e!==I?Ot(e,i,r):e._time)+r._delay),r._end=la(r._start+(r.totalDuration()/Math.abs(r.timeScale())||0)),Aa(e,r,"_first","_last",e._sort?"_start":0),xt(r)||(e._recent=r),n||Ma(e,r),e._ts<0&&La(e,e._tTime),e}function Oa(t,e){return(ht.ScrollTrigger||S("scrollTrigger",e))&&ht.ScrollTrigger.create(e,t)}function Pa(t,e,r,i,n){return $t(t,e,n),t._initted?!r&&t._pt&&!L&&(t._dur&&!1!==t.vars.lazy||!t._dur&&t.vars.lazy)&&f!==Lt.frame?(pt.push(t),t._lazy=[n,i],1):void 0:1}function Ua(t,e,r,i){var n=t._repeat,a=la(e)||0,s=t._tTime/t._tDur;return s&&!i&&(t._time*=a/t._dur),t._dur=a,t._tDur=n?n<0?1e10:la(a*(n+1)+t._rDelay*n):a,0<s&&!i&&La(t,t._tTime=t._tDur*s),t.parent&&Ka(t),r||Da(t.parent,t),t}function Va(t){return t instanceof Gt?Da(t):Ua(t,t._dur)}function Ya(e,r,i){var n,a,s=t(r[1]),o=(s?2:1)+(e<2?0:1),u=r[o];if(s&&(u.duration=r[1]),u.parent=i,e){for(n=u,a=i;a&&!("immediateRender"in n);)n=a.vars.defaults||{},a=w(a.vars.inherit)&&a.parent;u.immediateRender=w(n.immediateRender),e<2?u.runBackwards=1:u.startAt=r[o-1]}return new te(r[0],u,r[1+o])}function Za(t,e){return t||0===t?e(t):e}function _a(t,e){return r(t)&&(e=ut.exec(t))?e[1]:""}function cb(t,e){return t&&v(t)&&"length"in t&&(!e&&!t.length||t.length-1 in t&&v(t[0]))&&!t.nodeType&&t!==h}function fb(r){return r=Pt(r)[0]||T("Invalid scope")||{},function(t){var e=r.current||r.nativeElement||r;return Pt(t,e.querySelectorAll?e:e===r?T("Invalid scope")||a.createElement("div"):r)}}function gb(t){return t.sort(function(){return.5-Math.random()})}function hb(t){if(s(t))return t;var p=v(t)?t:{each:t},_=jt(p.ease),m=p.from||0,g=parseFloat(p.base)||0,y={},e=0<m&&m<1,T=isNaN(m)||e,b=p.axis,w=m,x=m;return r(m)?w=x={center:.5,edges:.5,end:1}[m]||0:!e&&T&&(w=m[0],x=m[1]),function(t,e,r){var i,n,a,s,o,u,h,l,f,c=(r||p).length,d=y[c];if(!d){if(!(f="auto"===p.grid?0:(p.grid||[1,q])[1])){for(h=-q;h<(h=r[f++].getBoundingClientRect().left)&&f<c;);f<c&&f--}for(d=y[c]=[],i=T?Math.min(f,c)*w-.5:m%f,n=f===q?0:T?c*x/f-.5:m/f|0,l=q,u=h=0;u<c;u++)a=u%f-i,s=n-(u/f|0),d[u]=o=b?Math.abs("y"===b?s:a):H(a*a+s*s),h<o&&(h=o),o<l&&(l=o);"random"===m&&gb(d),d.max=h-l,d.min=l,d.v=c=(parseFloat(p.amount)||parseFloat(p.each)*(c<f?c-1:b?"y"===b?c/f:f:Math.max(f,c/f))||0)*("edges"===m?-1:1),d.b=c<0?g-c:g,d.u=_a(p.amount||p.each)||0,_=_&&c<0?Yt(_):_}return c=(d[t]-d.min)/d.max||0,la(d.b+(_?_(c):c)*d.v)+d.u}}function ib(i){var n=Math.pow(10,((i+"").split(".")[1]||"").length);return function(e){var r=la(Math.round(parseFloat(e)/i)*i*n);return(r-r%1)/n+(t(e)?0:_a(e))}}function jb(h,e){var l,f,r=K(h);return!r&&v(h)&&(l=r=h.radius||q,h.values?(h=Pt(h.values),(f=!t(h[0]))&&(l*=l)):h=ib(h.increment)),Za(e,r?s(h)?function(t){return f=h(t),Math.abs(f-t)<=l?f:t}:function(e){for(var r,i,n=parseFloat(f?e.x:e),a=parseFloat(f?e.y:0),s=q,o=0,u=h.length;u--;)(r=f?(r=h[u].x-n)*r+(i=h[u].y-a)*i:Math.abs(h[u]-n))<s&&(s=r,o=u);return o=!l||s<=l?h[o]:e,f||o===e||t(e)?o:o+_a(e)}:ib(h))}function kb(t,e,r,i){return Za(K(t)?!e:!0===r?!!(r=0):!i,function(){return K(t)?t[~~(Math.random()*t.length)]:(r=r||1e-5)&&(i=r<1?Math.pow(10,(r+"").length-2):1)&&Math.floor(Math.round((t-r/2+Math.random()*(e-t+.99*r))/r)*r*i)/i})}function ob(e,r,t){return Za(t,function(t){return e[~~r(t)]})}function rb(t){return t.replace(tt,function(t){var e=t.indexOf("[")+1,r=t.substring(e||7,e?t.indexOf("]"):t.length-1).split(et);return kb(e?r:+r[0],e?0:+r[1],+r[2]||1e-5)})}function ub(t,e,r){var i,n,a,s=t.labels,o=q;for(i in s)(n=s[i]-e)<0==!!r&&n&&o>(n=Math.abs(n))&&(a=i,o=n);return a}function wb(t){return Ca(t),t.scrollTrigger&&t.scrollTrigger.kill(!!L),t.progress()<1&&At(t,"onInterrupt"),t}function zb(t){if(t)if(t=!t.name&&t.default||t,x()||t.headless){var e=t.name,r=s(t),i=e&&!r&&t.init?function(){this._props=[]}:t,n={init:V,render:_e,add:Ht,kill:Te,modifier:ve,rawVars:0},a={targetTest:0,get:0,getSetter:ue,aliases:{},register:0};if(It(),t!==i){if(mt[e])return;ta(i,ta(xa(t,n),a)),bt(i.prototype,bt(n,xa(t,a))),mt[i.prop=e]=i,t.targetTest&&(yt.push(i),dt[e]=1),e=("css"===e?"CSS":e.charAt(0).toUpperCase()+e.substr(1))+"Plugin"}U(e,i),t.register&&t.register(Fe,i,we)}else Dt.push(t)}function Cb(t,e,r){return(6*(t+=t<0?1:1<t?-1:0)<1?e+(r-e)*t*6:t<.5?r:3*t<2?e+(r-e)*(2/3-t)*6:e)*zt+.5|0}function Db(e,r,i){var n,a,s,o,u,h,l,f,c,d,p=e?t(e)?[e>>16,e>>8&zt,e&zt]:0:Rt.black;if(!p){if(","===e.substr(-1)&&(e=e.substr(0,e.length-1)),Rt[e])p=Rt[e];else if("#"===e.charAt(0)){if(e.length<6&&(e="#"+(n=e.charAt(1))+n+(a=e.charAt(2))+a+(s=e.charAt(3))+s+(5===e.length?e.charAt(4)+e.charAt(4):"")),9===e.length)return[(p=parseInt(e.substr(1,6),16))>>16,p>>8&zt,p&zt,parseInt(e.substr(7),16)/255];p=[(e=parseInt(e.substr(1),16))>>16,e>>8&zt,e&zt]}else if("hsl"===e.substr(0,3))if(p=d=e.match(rt),r){if(~e.indexOf("="))return p=e.match(it),i&&p.length<4&&(p[3]=1),p}else o=+p[0]%360/360,u=p[1]/100,n=2*(h=p[2]/100)-(a=h<=.5?h*(u+1):h+u-h*u),3<p.length&&(p[3]*=1),p[0]=Cb(o+1/3,n,a),p[1]=Cb(o,n,a),p[2]=Cb(o-1/3,n,a);else p=e.match(rt)||Rt.transparent;p=p.map(Number)}return r&&!d&&(n=p[0]/zt,a=p[1]/zt,s=p[2]/zt,h=((l=Math.max(n,a,s))+(f=Math.min(n,a,s)))/2,l===f?o=u=0:(c=l-f,u=.5<h?c/(2-l-f):c/(l+f),o=l===n?(a-s)/c+(a<s?6:0):l===a?(s-n)/c+2:(n-a)/c+4,o*=60),p[0]=~~(o+.5),p[1]=~~(100*u+.5),p[2]=~~(100*h+.5)),i&&p.length<4&&(p[3]=1),p}function Eb(t){var r=[],i=[],n=-1;return t.split(Et).forEach(function(t){var e=t.match(nt)||[];r.push.apply(r,e),i.push(n+=e.length+1)}),r.c=i,r}function Fb(t,e,r){var i,n,a,s,o="",u=(t+o).match(Et),h=e?"hsla(":"rgba(",l=0;if(!u)return t;if(u=u.map(function(t){return(t=Db(t,e,1))&&h+(e?t[0]+","+t[1]+"%,"+t[2]+"%,"+t[3]:t.join(","))+")"}),r&&(a=Eb(t),(i=r.c).join(o)!==a.c.join(o)))for(s=(n=t.replace(Et,"1").split(nt)).length-1;l<s;l++)o+=n[l]+(~i.indexOf(l)?u.shift()||h+"0,0,0,0)":(a.length?a:u.length?u:r).shift());if(!n)for(s=(n=t.split(Et)).length-1;l<s;l++)o+=n[l]+u[l];return o+n[s]}function Ib(t){var e,r=t.join(" ");if(Et.lastIndex=0,Et.test(r))return e=Ft.test(r),t[1]=Fb(t[1],e),t[0]=Fb(t[0],e,Eb(t[1])),!0}function Rb(t){var e=(t+"").split("("),r=Bt[e[0]];return r&&1<e.length&&r.config?r.config.apply(null,~t.indexOf("{")?[function _parseObjectInString(t){for(var e,r,i,n={},a=t.substr(1,t.length-3).split(":"),s=a[0],o=1,u=a.length;o<u;o++)r=a[o],e=o!==u-1?r.lastIndexOf(","):r.length,i=r.substr(0,e),n[s]=isNaN(i)?i.replace(Ut,"").trim():+i,s=r.substr(e+1).trim();return n}(e[1])]:function _valueInParentheses(t){var e=t.indexOf("(")+1,r=t.indexOf(")"),i=t.indexOf("(",e);return t.substring(e,~i&&i<r?t.indexOf(")",r+1):r)}(t).split(",").map(ra)):Bt._CE&&Nt.test(t)?Bt._CE("",t):r}function Ub(t,e,r,i){void 0===r&&(r=function easeOut(t){return 1-e(1-t)}),void 0===i&&(i=function easeInOut(t){return t<.5?e(2*t)/2:1-e(2*(1-t))/2});var n,a={easeIn:e,easeOut:r,easeInOut:i};return ja(t,function(t){for(var e in Bt[t]=ht[t]=a,Bt[n=t.toLowerCase()]=r,a)Bt[n+("easeIn"===e?".in":"easeOut"===e?".out":".inOut")]=Bt[t+"."+e]=a[e]}),a}function Vb(e){return function(t){return t<.5?(1-e(1-2*t))/2:.5+e(2*(t-.5))/2}}function Wb(r,t,e){function Gm(t){return 1===t?1:i*Math.pow(2,-10*t)*Q((t-a)*n)+1}var i=1<=t?t:1,n=(e||(r?.3:.45))/(t<1?t:1),a=n/G*(Math.asin(1/i)||0),s="out"===r?Gm:"in"===r?function(t){return 1-Gm(1-t)}:Vb(Gm);return n=G/n,s.config=function(t,e){return Wb(r,t,e)},s}function Xb(e,r){function Om(t){return t?--t*t*((r+1)*t+r)+1:0}void 0===r&&(r=1.70158);var t="out"===e?Om:"in"===e?function(t){return 1-Om(1-t)}:Vb(Om);return t.config=function(t){return Xb(e,t)},t}var F,L,l,I,h,n,a,i,o,f,c,d,p,_,m,g,b,k,O,M,C,P,A,D,z,E,B,N,Y={autoSleep:120,force3D:"auto",nullTargetWarn:1,units:{lineHeight:""}},j={duration:.5,overwrite:!1,delay:0},q=1e8,X=1/q,G=2*Math.PI,Z=G/4,W=0,H=Math.sqrt,$=Math.cos,Q=Math.sin,J="function"==typeof ArrayBuffer&&ArrayBuffer.isView||function(){},K=Array.isArray,tt=/random\([^)]+\)/g,et=/,\s*/g,rt=/(?:-?\.?\d|\.)+/gi,it=/[-+=.]*\d+[.e\-+]*\d*[e\-+]*\d*/g,nt=/[-+=.]*\d+[.e-]*\d*[a-z%]*/g,at=/[-+=.]*\d+\.?\d*(?:e-|e\+)?\d*/gi,st=/[+-]=-?[.\d]+/,ot=/[^,'"\[\]\s]+/gi,ut=/^[+\-=e\s\d]*\d+[.\d]*([a-z]*|%)\s*$/i,ht={},lt={suppressEvents:!0,isStart:!0,kill:!1},ft={suppressEvents:!0,kill:!1},ct={suppressEvents:!0},dt={},pt=[],_t={},mt={},gt={},vt=30,yt=[],Tt="",bt=function _merge(t,e){for(var r in e)t[r]=e[r];return t},wt=function _animationCycle(t,e){var r=Math.floor(t=la(t/e));return t&&r===t?r-1:r},xt=function _isFromOrFromStart(t){var e=t.data;return"isFromStart"===e||"isStart"===e},kt={_start:0,endTime:V,totalDuration:V},Ot=function _parsePosition(t,e,i){var n,a,s,o=t.labels,u=t._recent||kt,h=t.duration()>=q?u.endTime(!1):t._dur;return r(e)&&(isNaN(e)||e in o)?(a=e.charAt(0),s="%"===e.substr(-1),n=e.indexOf("="),"<"===a||">"===a?(0<=n&&(e=e.replace(/=/,"")),("<"===a?u._start:u.endTime(0<=u._repeat))+(parseFloat(e.substr(1))||0)*(s?(n<0?u:i).totalDuration()/100:1)):n<0?(e in o||(o[e]=h),o[e]):(a=parseFloat(e.charAt(n-1)+e.substr(n+1)),s&&i&&(a=a/100*(K(i)?i[0]:i).totalDuration()),1<n?_parsePosition(t,e.substr(0,n-1),i)+a:h+a)):null==e?h:+e},Mt=function _clamp(t,e,r){return r<t?t:e<r?e:r},Ct=[].slice,Pt=function toArray(t,e,i){return l&&!e&&l.selector?l.selector(t):!r(t)||i||!n&&It()?K(t)?function _flatten(t,e,i){return void 0===i&&(i=[]),t.forEach(function(t){return r(t)&&!e||cb(t,1)?i.push.apply(i,Pt(t)):i.push(t)})||i}(t,i):cb(t)?Ct.call(t,0):t?[t]:[]:Ct.call((e||a).querySelectorAll(t),0)},St=function mapRange(e,t,r,i,n){var a=t-e,s=i-r;return Za(n,function(t){return r+((t-e)/a*s||0)})},At=function _callback(t,e,r){var i,n,a,s=t.vars,o=s[e],u=l,h=t._ctx;if(o)return i=s[e+"Params"],n=s.callbackScope||t,r&&pt.length&&oa(),h&&(l=h),a=i?o.apply(n,i):o.call(n),l=u,a},Dt=[],zt=255,Rt={aqua:[0,zt,zt],lime:[0,zt,0],silver:[192,192,192],black:[0,0,0],maroon:[128,0,0],teal:[0,128,128],blue:[0,0,zt],navy:[0,0,128],white:[zt,zt,zt],olive:[128,128,0],yellow:[zt,zt,0],orange:[zt,165,0],gray:[128,128,128],purple:[128,0,128],green:[0,128,0],red:[zt,0,0],pink:[zt,192,203],cyan:[0,zt,zt],transparent:[zt,zt,zt,0]},Et=function(){var t,e="(?:\\b(?:(?:rgb|rgba|hsl|hsla)\\(.+?\\))|\\B#(?:[0-9a-f]{3,4}){1,2}\\b";for(t in Rt)e+="|"+t+"\\b";return new RegExp(e+")","gi")}(),Ft=/hsl[a]?\(/,Lt=(O=Date.now,M=500,C=33,P=O(),A=P,z=D=1e3/240,g={time:0,frame:0,tick:function tick(){zl(!0)},deltaRatio:function deltaRatio(t){return b/(1e3/(t||60))},wake:function wake(){o&&(!n&&x()&&(h=n=window,a=h.document||{},ht.gsap=Fe,(h.gsapVersions||(h.gsapVersions=[])).push(Fe.version),R(i||h.GreenSockGlobals||!h.gsap&&h||{}),Dt.forEach(zb)),m="undefined"!=typeof requestAnimationFrame&&requestAnimationFrame,p&&g.sleep(),_=m||function(t){return setTimeout(t,z-1e3*g.time+1|0)},d=1,zl(2))},sleep:function sleep(){(m?cancelAnimationFrame:clearTimeout)(p),d=0,_=V},lagSmoothing:function lagSmoothing(t,e){M=t||1/0,C=Math.min(e||33,M)},fps:function fps(t){D=1e3/(t||240),z=1e3*g.time+D},add:function add(n,t,e){var a=t?function(t,e,r,i){n(t,e,r,i),g.remove(a)}:n;return g.remove(n),E[e?"unshift":"push"](a),It(),a},remove:function remove(t,e){~(e=E.indexOf(t))&&E.splice(e,1)&&e<=k&&k--},_listeners:E=[]}),It=function _wake(){return!d&&Lt.wake()},Bt={},Nt=/^[\d.\-M][\d.\-,\s]/,Ut=/["']/g,Yt=function _invertEase(e){return function(t){return 1-e(1-t)}},jt=function _parseEase(t,e){return t&&(s(t)?t:Bt[t]||Rb(t))||e};function zl(t){var e,r,i,n,a=O()-A,s=!0===t;if((M<a||a<0)&&(P+=a-C),(0<(e=(i=(A+=a)-P)-z)||s)&&(n=++g.frame,b=i-1e3*g.time,g.time=i/=1e3,z+=e+(D<=e?0:D-e),r=1),s||(p=_(zl)),r)for(k=0;k<E.length;k++)E[k](i,b,n,t)}function dn(t){return t<N?B*t*t:t<.7272727272727273?B*Math.pow(t-1.5/2.75,2)+.75:t<.9090909090909092?B*(t-=2.25/2.75)*t+.9375:B*Math.pow(t-2.625/2.75,2)+.984375}ja("Linear,Quad,Cubic,Quart,Quint,Strong",function(t,e){var r=e<5?e+1:e;Ub(t+",Power"+(r-1),e?function(t){return Math.pow(t,r)}:function(t){return t},function(t){return 1-Math.pow(1-t,r)},function(t){return t<.5?Math.pow(2*t,r)/2:1-Math.pow(2*(1-t),r)/2})}),Bt.Linear.easeNone=Bt.none=Bt.Linear.easeIn,Ub("Elastic",Wb("in"),Wb("out"),Wb()),B=7.5625,N=1/2.75,Ub("Bounce",function(t){return 1-dn(1-t)},dn),Ub("Expo",function(t){return Math.pow(2,10*(t-1))*t+t*t*t*t*t*t*(1-t)}),Ub("Circ",function(t){return-(H(1-t*t)-1)}),Ub("Sine",function(t){return 1===t?1:1-$(t*Z)}),Ub("Back",Xb("in"),Xb("out"),Xb()),Bt.SteppedEase=Bt.steps=ht.SteppedEase={config:function config(t,e){void 0===t&&(t=1);var r=1/t,i=t+(e?0:1),n=e?1:0;return function(t){return((i*Mt(0,.99999999,t)|0)+n)*r}}},j.ease=Bt["quad.out"],ja("onComplete,onUpdate,onStart,onRepeat,onReverseComplete,onInterrupt",function(t){return Tt+=t+","+t+"Params,"});var Vt,qt=function GSCache(t,e){this.id=W++,(t._gsap=this).target=t,this.harness=e,this.get=e?e.get:ia,this.set=e?e.getSetter:ue},Xt=((Vt=Animation.prototype).delay=function delay(t){return t||0===t?(this.parent&&this.parent.smoothChildTiming&&this.startTime(this._start+t-this._delay),this._delay=t,this):this._delay},Vt.duration=function duration(t){return arguments.length?this.totalDuration(0<this._repeat?t+(t+this._rDelay)*this._repeat:t):this.totalDuration()&&this._dur},Vt.totalDuration=function totalDuration(t){return arguments.length?(this._dirty=0,Ua(this,this._repeat<0?t:(t-this._repeat*this._rDelay)/(this._repeat+1))):this._tDur},Vt.totalTime=function totalTime(t,e){if(It(),!arguments.length)return this._tTime;var r=this._dp;if(r&&r.smoothChildTiming&&this._ts){for(La(this,t),!r._dp||r.parent||Ma(r,this);r&&r.parent;)r.parent._time!==r._start+(0<=r._ts?r._tTime/r._ts:(r.totalDuration()-r._tTime)/-r._ts)&&r.totalTime(r._tTime,!0),r=r.parent;!this.parent&&this._dp.autoRemoveChildren&&(0<this._ts&&t<this._tDur||this._ts<0&&0<t||!this._tDur&&!t)&&Na(this._dp,this,this._start-this._delay)}return(this._tTime!==t||!this._dur&&!e||this._initted&&Math.abs(this._zTime)===X||!this._initted&&this._dur&&t||!t&&!this._initted&&(this.add||this._ptLookup))&&(this._ts||(this._pTime=t),qa(this,t,e)),this},Vt.time=function time(t,e){return arguments.length?this.totalTime(Math.min(this.totalDuration(),t+Ha(this))%(this._dur+this._rDelay)||(t?this._dur:0),e):this._time},Vt.totalProgress=function totalProgress(t,e){return arguments.length?this.totalTime(this.totalDuration()*t,e):this.totalDuration()?Math.min(1,this._tTime/this._tDur):0<=this.rawTime()&&this._initted?1:0},Vt.progress=function progress(t,e){return arguments.length?this.totalTime(this.duration()*(!this._yoyo||1&this.iteration()?t:1-t)+Ha(this),e):this.duration()?Math.min(1,this._time/this._dur):0<this.rawTime()?1:0},Vt.iteration=function iteration(t,e){var r=this.duration()+this._rDelay;return arguments.length?this.totalTime(this._time+(t-1)*r,e):this._repeat?wt(this._tTime,r)+1:1},Vt.timeScale=function timeScale(t,e){if(!arguments.length)return this._rts===-X?0:this._rts;if(this._rts===t)return this;var r=this.parent&&this._ts?Ja(this.parent._time,this):this._tTime,i=this._rts<0;this._rts=+t||0,this._ts=this._ps||t===-X?0:this._rts;var n=this.totalDuration();return(i!=this._rts<0||0<r&&r<n)&&this.totalTime(Mt(-Math.abs(this._delay),n,r),!1!==e),Ka(this),function _recacheAncestors(t){for(var e=t.parent;e&&e.parent;)e._dirty=1,e.totalDuration(),e=e.parent;return t}(this)},Vt.paused=function paused(t){if(!arguments.length)return this._ps;if(this._ps!==t)if(this._ps=t)this._pTime=this._tTime||Math.max(-this._delay,this.rawTime()),this._ts=this._act=0;else{It(),this._ts=this._rts;var e,r=this.parent&&!this.parent.smoothChildTiming?this.rawTime():this._tTime||this._pTime,i=1===this.progress()&&Math.abs(this._zTime)!==X;if(i)for(this._tTime-=X,e=this._first;e;){if(!e._dur&&e._zTime<0&&e._ts&&e._start<=r+X){i=!1;break}e=e._next}this.totalTime(r,i)}return this},Vt.startTime=function startTime(t){if(arguments.length){this._start=la(t);var e=this.parent||this._dp;return!e||!e._sort&&this.parent||Na(e,this,this._start-this._delay),this}return this._start},Vt.endTime=function endTime(t){return this._start+(w(t)?this.totalDuration():this.duration())/Math.abs(this._ts||1)},Vt.rawTime=function rawTime(t){var e=this.parent||this._dp;return e?t&&(!this._ts||this._repeat&&this._time&&this.totalProgress()<1)?this._tTime%(this._dur+this._rDelay):this._ts?Ja(e.rawTime(t),this):this._tTime:this._tTime},Vt.revert=function revert(t){void 0===t&&(t=ct);var e=L;return L=t,pa(this)&&(this.timeline&&this.timeline.revert(t),this.totalTime(-.01,t.suppressEvents)),"nested"!==this.data&&!1!==t.kill&&this.kill(),L=e,this},Vt.globalTime=function globalTime(t){for(var e=this,r=arguments.length?t:e.rawTime();e;)r=e._start+r/(Math.abs(e._ts)||1),e=e._dp;return!this.parent&&this._sat?this._sat.globalTime(t):r},Vt.repeat=function repeat(t){return arguments.length?(this._repeat=t===1/0?-2:t,Va(this)):-2===this._repeat?1/0:this._repeat},Vt.repeatDelay=function repeatDelay(t){if(arguments.length){var e=this._time;return this._rDelay=t,Va(this),e?this.time(e):this}return this._rDelay},Vt.yoyo=function yoyo(t){return arguments.length?(this._yoyo=t,this):this._yoyo},Vt.seek=function seek(t,e){return this.totalTime(Ot(this,t),w(e))},Vt.restart=function restart(t,e){return this.play().totalTime(t?-this._delay:0,w(e)),this._dur||(this._zTime=-X),this},Vt.play=function play(t,e){return null!=t&&this.seek(t,e),this.reversed(!1).paused(!1)},Vt.reverse=function reverse(t,e){return null!=t&&this.seek(t||this.totalDuration(),e),this.reversed(!0).paused(!1)},Vt.pause=function pause(t,e){return null!=t&&this.seek(t,e),this.paused(!0)},Vt.resume=function resume(){return this.paused(!1)},Vt.reversed=function reversed(t){return arguments.length?(!!t!==this.reversed()&&this.timeScale(-this._rts||(t?-X:0)),this):this._rts<0},Vt.invalidate=function invalidate(){return this._initted=this._act=0,this._zTime=-X,this},Vt.isActive=function isActive(){var t,e=this.parent||this._dp,r=this._start;return!(e&&!(this._ts&&this._initted&&e.isActive()&&(t=e.rawTime(!0))>=r&&t<this.endTime(!0)-X))},Vt.eventCallback=function eventCallback(t,e,r){var i=this.vars;return 1<arguments.length?(e?(i[t]=e,r&&(i[t+"Params"]=r),"onUpdate"===t&&(this._onUpdate=e)):delete i[t],this):i[t]},Vt.then=function then(t){var i=this,n=i._prom;return new Promise(function(e){function Fo(){var t=i.then;i.then=null,n&&n(),s(r)&&(r=r(i))&&(r.then||r===i)&&(i.then=t),e(r),i.then=t}var r=s(t)?t:sa;i._initted&&1===i.totalProgress()&&0<=i._ts||!i._tTime&&i._ts<0?Fo():i._prom=Fo})},Vt.kill=function kill(){wb(this)},Animation);function Animation(t){this.vars=t,this._delay=+t.delay||0,(this._repeat=t.repeat===1/0?-2:t.repeat||0)&&(this._rDelay=t.repeatDelay||0,this._yoyo=!!t.yoyo||!!t.yoyoEase),this._ts=1,Ua(this,+t.duration,1,1),this.data=t.data,l&&(this._ctx=l).data.push(this),d||Lt.wake()}ta(Xt.prototype,{_time:0,_start:0,_end:0,_tTime:0,_tDur:0,_dirty:0,_repeat:0,_yoyo:!1,parent:null,_initted:!1,_rDelay:0,_ts:1,_dp:0,ratio:0,_zTime:-X,_prom:0,_ps:!1,_rts:1});var Gt=function(i){function Timeline(t,e){var r;return void 0===t&&(t={}),(r=i.call(this,t)||this).labels={},r.smoothChildTiming=!!t.smoothChildTiming,r.autoRemoveChildren=!!t.autoRemoveChildren,r._sort=w(t.sortChildren),I&&Na(t.parent||I,_assertThisInitialized(r),e),t.reversed&&r.reverse(),t.paused&&r.paused(!0),t.scrollTrigger&&Oa(_assertThisInitialized(r),t.scrollTrigger),r}_inheritsLoose(Timeline,i);var e=Timeline.prototype;return e.to=function to(t,e,r){return Ya(0,arguments,this),this},e.from=function from(t,e,r){return Ya(1,arguments,this),this},e.fromTo=function fromTo(t,e,r,i){return Ya(2,arguments,this),this},e.set=function set(t,e,r){return e.duration=0,e.parent=this,ya(e).repeatDelay||(e.repeat=0),e.immediateRender=!!e.immediateRender,new te(t,e,Ot(this,r),1),this},e.call=function call(t,e,r){return Na(this,te.delayedCall(0,t,e),r)},e.staggerTo=function staggerTo(t,e,r,i,n,a,s){return r.duration=e,r.stagger=r.stagger||i,r.onComplete=a,r.onCompleteParams=s,r.parent=this,new te(t,r,Ot(this,n)),this},e.staggerFrom=function staggerFrom(t,e,r,i,n,a,s){return r.runBackwards=1,ya(r).immediateRender=w(r.immediateRender),this.staggerTo(t,e,r,i,n,a,s)},e.staggerFromTo=function staggerFromTo(t,e,r,i,n,a,s,o){return i.startAt=r,ya(i).immediateRender=w(i.immediateRender),this.staggerTo(t,e,i,n,a,s,o)},e.render=function render(t,e,r){var i,n,a,s,o,u,h,l,f,c,d,p,_=this._time,m=this._dirty?this.totalDuration():this._tDur,g=this._dur,v=t<=0?0:la(t),y=this._zTime<0!=t<0&&(this._initted||!g);if(this!==I&&m<v&&0<=t&&(v=m),v!==this._tTime||r||y){if(_!==this._time&&g&&(v+=this._time-_,t+=this._time-_),i=v,f=this._start,u=!(l=this._ts),y&&(g||(_=this._zTime),!t&&e||(this._zTime=t)),this._repeat){if(d=this._yoyo,o=g+this._rDelay,this._repeat<-1&&t<0)return this.totalTime(100*o+t,e,r);if(i=la(v%o),v===m?(s=this._repeat,i=g):((s=~~(c=la(v/o)))&&s===c&&(i=g,s--),g<i&&(i=g)),c=wt(this._tTime,o),!_&&this._tTime&&c!==s&&this._tTime-c*o-this._dur<=0&&(c=s),d&&1&s&&(i=g-i,p=1),s!==c&&!this._lock){var T=d&&1&c,b=T===(d&&1&s);if(s<c&&(T=!T),_=T?0:v%g?g:v,this._lock=1,this.render(_||(p?0:la(s*o)),e,!g)._lock=0,this._tTime=v,!e&&this.parent&&At(this,"onRepeat"),this.vars.repeatRefresh&&!p&&(this.invalidate()._lock=1,c=s),_&&_!==this._time||u!=!this._ts||this.vars.onRepeat&&!this.parent&&!this._act)return this;if(g=this._dur,m=this._tDur,b&&(this._lock=2,_=T?g:-1e-4,this.render(_,!0),this.vars.repeatRefresh&&!p&&this.invalidate()),this._lock=0,!this._ts&&!u)return this}}if(this._hasPause&&!this._forcing&&this._lock<2&&(h=function _findNextPauseTween(t,e,r){var i;if(e<r)for(i=t._first;i&&i._start<=r;){if("isPause"===i.data&&i._start>e)return i;i=i._next}else for(i=t._last;i&&i._start>=r;){if("isPause"===i.data&&i._start<e)return i;i=i._prev}}(this,la(_),la(i)))&&(v-=i-(i=h._start)),this._tTime=v,this._time=i,this._act=!!l,this._initted||(this._onUpdate=this.vars.onUpdate,this._initted=1,this._zTime=t,_=0),!_&&v&&g&&!e&&!c&&(At(this,"onStart"),this._tTime!==v))return this;if(_<=i&&0<=t)for(n=this._first;n;){if(a=n._next,(n._act||i>=n._start)&&n._ts&&h!==n){if(n.parent!==this)return this.render(t,e,r);if(n.render(0<n._ts?(i-n._start)*n._ts:(n._dirty?n.totalDuration():n._tDur)+(i-n._start)*n._ts,e,r),i!==this._time||!this._ts&&!u){h=0,a&&(v+=this._zTime=-X);break}}n=a}else{n=this._last;for(var w=t<0?t:i;n;){if(a=n._prev,(n._act||w<=n._end)&&n._ts&&h!==n){if(n.parent!==this)return this.render(t,e,r);if(n.render(0<n._ts?(w-n._start)*n._ts:(n._dirty?n.totalDuration():n._tDur)+(w-n._start)*n._ts,e,r||L&&pa(n)),i!==this._time||!this._ts&&!u){h=0,a&&(v+=this._zTime=w?-X:X);break}}n=a}}if(h&&!e&&(this.pause(),h.render(_<=i?0:-X)._zTime=_<=i?1:-1,this._ts))return this._start=f,Ka(this),this.render(t,e,r);this._onUpdate&&!e&&At(this,"onUpdate",!0),(v===m&&this._tTime>=this.totalDuration()||!v&&_)&&(f!==this._start&&Math.abs(l)===Math.abs(this._ts)||this._lock||(!t&&g||!(v===m&&0<this._ts||!v&&this._ts<0)||Ca(this,1),e||t<0&&!_||!v&&!_&&m||(At(this,v===m&&0<=t?"onComplete":"onReverseComplete",!0),!this._prom||v<m&&0<this.timeScale()||this._prom())))}return this},e.add=function add(e,i){var n=this;if(t(i)||(i=Ot(this,i,e)),!(e instanceof Xt)){if(K(e))return e.forEach(function(t){return n.add(t,i)}),this;if(r(e))return this.addLabel(e,i);if(!s(e))return this;e=te.delayedCall(0,e)}return this!==e?Na(this,e,i):this},e.getChildren=function getChildren(t,e,r,i){void 0===t&&(t=!0),void 0===e&&(e=!0),void 0===r&&(r=!0),void 0===i&&(i=-q);for(var n=[],a=this._first;a;)a._start>=i&&(a instanceof te?e&&n.push(a):(r&&n.push(a),t&&n.push.apply(n,a.getChildren(!0,e,r)))),a=a._next;return n},e.getById=function getById(t){for(var e=this.getChildren(1,1,1),r=e.length;r--;)if(e[r].vars.id===t)return e[r]},e.remove=function remove(t){return r(t)?this.removeLabel(t):s(t)?this.killTweensOf(t):(t.parent===this&&Ba(this,t),t===this._recent&&(this._recent=this._last),Da(this))},e.totalTime=function totalTime(t,e){return arguments.length?(this._forcing=1,!this._dp&&this._ts&&(this._start=la(Lt.time-(0<this._ts?t/this._ts:(this.totalDuration()-t)/-this._ts))),i.prototype.totalTime.call(this,t,e),this._forcing=0,this):this._tTime},e.addLabel=function addLabel(t,e){return this.labels[t]=Ot(this,e),this},e.removeLabel=function removeLabel(t){return delete this.labels[t],this},e.addPause=function addPause(t,e,r){var i=te.delayedCall(0,e||V,r);return i.data="isPause",this._hasPause=1,Na(this,i,Ot(this,t))},e.removePause=function removePause(t){var e=this._first;for(t=Ot(this,t);e;)e._start===t&&"isPause"===e.data&&Ca(e),e=e._next},e.killTweensOf=function killTweensOf(t,e,r){for(var i=this.getTweensOf(t,r),n=i.length;n--;)Zt!==i[n]&&i[n].kill(t,e);return this},e.getTweensOf=function getTweensOf(e,r){for(var i,n=[],a=Pt(e),s=this._first,o=t(r);s;)s instanceof te?na(s._targets,a)&&(o?(!Zt||s._initted&&s._ts)&&s.globalTime(0)<=r&&s.globalTime(s.totalDuration())>r:!r||s.isActive())&&n.push(s):(i=s.getTweensOf(a,r)).length&&n.push.apply(n,i),s=s._next;return n},e.tweenTo=function tweenTo(t,e){e=e||{};var r,i=this,n=Ot(i,t),a=e.startAt,s=e.onStart,o=e.onStartParams,u=e.immediateRender,h=te.to(i,ta({ease:e.ease||"none",lazy:!1,immediateRender:!1,time:n,overwrite:"auto",duration:e.duration||Math.abs((n-(a&&"time"in a?a.time:i._time))/i.timeScale())||X,onStart:function onStart(){if(i.pause(),!r){var t=e.duration||Math.abs((n-(a&&"time"in a?a.time:i._time))/i.timeScale());h._dur!==t&&Ua(h,t,0,1).render(h._time,!0,!0),r=1}s&&s.apply(h,o||[])}},e));return u?h.render(0):h},e.tweenFromTo=function tweenFromTo(t,e,r){return this.tweenTo(e,ta({startAt:{time:Ot(this,t)}},r))},e.recent=function recent(){return this._recent},e.nextLabel=function nextLabel(t){return void 0===t&&(t=this._time),ub(this,Ot(this,t))},e.previousLabel=function previousLabel(t){return void 0===t&&(t=this._time),ub(this,Ot(this,t),1)},e.currentLabel=function currentLabel(t){return arguments.length?this.seek(t,!0):this.previousLabel(this._time+X)},e.shiftChildren=function shiftChildren(t,e,r){void 0===r&&(r=0);var i,n=this._first,a=this.labels;for(t=la(t);n;)n._start>=r&&(n._start+=t,n._end+=t),n=n._next;if(e)for(i in a)a[i]>=r&&(a[i]+=t);return Da(this)},e.invalidate=function invalidate(t){var e=this._first;for(this._lock=0;e;)e.invalidate(t),e=e._next;return i.prototype.invalidate.call(this,t)},e.clear=function clear(t){void 0===t&&(t=!0);for(var e,r=this._first;r;)e=r._next,this.remove(r),r=e;return this._dp&&(this._time=this._tTime=this._pTime=0),t&&(this.labels={}),Da(this)},e.totalDuration=function totalDuration(t){var e,r,i,n=0,a=this,s=a._last,o=q;if(arguments.length)return a.timeScale((a._repeat<0?a.duration():a.totalDuration())/(a.reversed()?-t:t));if(a._dirty){for(i=a.parent;s;)e=s._prev,s._dirty&&s.totalDuration(),o<(r=s._start)&&a._sort&&s._ts&&!a._lock?(a._lock=1,Na(a,s,r-s._delay,1)._lock=0):o=r,r<0&&s._ts&&(n-=r,(!i&&!a._dp||i&&i.smoothChildTiming)&&(a._start+=la(r/a._ts),a._time-=r,a._tTime-=r),a.shiftChildren(-r,!1,-Infinity),o=0),s._end>n&&s._ts&&(n=s._end),s=e;Ua(a,a===I&&a._time>n?a._time:n,1,1),a._dirty=0}return a._tDur},Timeline.updateRoot=function updateRoot(t){if(I._ts&&(qa(I,Ja(t,I)),f=Lt.frame),Lt.frame>=vt){vt+=Y.autoSleep||120;var e=I._first;if((!e||!e._ts)&&Y.autoSleep&&Lt._listeners.length<2){for(;e&&!e._ts;)e=e._next;e||Lt.sleep()}}},Timeline}(Xt);ta(Gt.prototype,{_lock:0,_hasPause:0,_forcing:0});function cc(t,e,i,n,a,o){var u,h,l,f;if(mt[t]&&!1!==(u=new mt[t]).init(a,u.rawVars?e[t]:function _processVars(t,e,i,n,a){if(s(t)&&(t=Qt(t,a,e,i,n)),!v(t)||t.style&&t.nodeType||K(t)||J(t))return r(t)?Qt(t,a,e,i,n):t;var o,u={};for(o in t)u[o]=Qt(t[o],a,e,i,n);return u}(e[t],n,a,o,i),i,n,o)&&(i._pt=h=new we(i._pt,a,t,0,1,u.render,u,0,u.priority),i!==c))for(l=i._ptLookup[i._targets.indexOf(a)],f=u._props.length;f--;)l[u._props[f]]=h;return u}function ic(t,r,e,i){var n,a,s=r.ease||i||"power1.inOut";if(K(r))a=e[t]||(e[t]=[]),r.forEach(function(t,e){return a.push({t:e/(r.length-1)*100,v:t,e:s})});else for(n in r)a=e[n]||(e[n]=[]),"ease"===n||a.push({t:parseFloat(t),v:r[n],e:s})}var Zt,Wt,Ht=function _addPropTween(t,e,i,n,a,o,u,h,l,f){s(n)&&(n=n(a||0,t,o));var c,d=t[e],p="get"!==i?i:s(d)?l?t[e.indexOf("set")||!s(t["get"+e.substr(3)])?e:"get"+e.substr(3)](l):t[e]():d,_=s(d)?l?se:ae:ie;if(r(n)&&(~n.indexOf("random(")&&(n=rb(n)),"="===n.charAt(1)&&(!(c=ma(p,n)+(_a(p)||0))&&0!==c||(n=c))),!f||p!==n||Wt)return isNaN(p*n)||""===n?(d||e in t||S(e,n),function _addComplexStringPropTween(t,e,r,i,n,a,s){var o,u,h,l,f,c,d,p,_=new we(this._pt,t,e,0,1,pe,null,n),m=0,g=0;for(_.b=r,_.e=i,r+="",(d=~(i+="").indexOf("random("))&&(i=rb(i)),a&&(a(p=[r,i],t,e),r=p[0],i=p[1]),u=r.match(at)||[];o=at.exec(i);)l=o[0],f=i.substring(m,o.index),h?h=(h+1)%5:"rgba("===f.substr(-5)&&(h=1),l!==u[g++]&&(c=parseFloat(u[g-1])||0,_._pt={_next:_._pt,p:f||1===g?f:",",s:c,c:"="===l.charAt(1)?ma(c,l)-c:parseFloat(l)-c,m:h&&h<4?Math.round:0},m=at.lastIndex);return _.c=m<i.length?i.substring(m,i.length):"",_.fp=s,(st.test(i)||d)&&(_.e=0),this._pt=_}.call(this,t,e,p,n,_,h||Y.stringFilter,l)):(c=new we(this._pt,t,e,+p||0,n-(p||0),"boolean"==typeof d?de:fe,0,_),l&&(c.fp=l),u&&c.modifier(u,this,t),this._pt=c)},$t=function _initTween(t,e,r){var i,n,a,s,o,u,h,l,f,c,d,p,_,m=t.vars,g=m.ease,v=m.startAt,y=m.immediateRender,T=m.lazy,b=m.onUpdate,x=m.runBackwards,k=m.yoyoEase,O=m.keyframes,M=m.autoRevert,C=t._dur,P=t._startAt,S=t._targets,A=t.parent,D=A&&"nested"===A.data?A.vars.targets:S,z="auto"===t._overwrite&&!F,R=t.timeline,E=m.easeReverse||k;if(!R||O&&g||(g="none"),t._ease=jt(g,j.ease),t._rEase=E&&(jt(E)||t._ease),t._from=!R&&!!m.runBackwards,t._from&&(t.ratio=1),!R||O&&!m.stagger){if(p=(l=S[0]?ha(S[0]).harness:0)&&m[l.prop],i=xa(m,dt),P&&(P._zTime<0&&P.progress(1),e<0&&x&&y&&!M?P.render(-1,!0):P.revert(x&&C?ft:lt),P._lazy=0),v){if(Ca(t._startAt=te.set(S,ta({data:"isStart",overwrite:!1,parent:A,immediateRender:!0,lazy:!P&&w(T),startAt:null,delay:0,onUpdate:b&&function(){return At(t,"onUpdate")},stagger:0},v))),t._startAt._dp=0,t._startAt._sat=t,e<0&&(L||!y&&!M)&&t._startAt.revert(ft),y&&C&&e<=0&&r<=0)return void(e&&(t._zTime=e))}else if(x&&C&&!P)if(e&&(y=!1),a=ta({overwrite:!1,data:"isFromStart",lazy:y&&!P&&w(T),immediateRender:y,stagger:0,parent:A},i),p&&(a[l.prop]=p),Ca(t._startAt=te.set(S,a)),t._startAt._dp=0,t._startAt._sat=t,e<0&&(L?t._startAt.revert(ft):t._startAt.render(-1,!0)),t._zTime=e,y){if(!e)return}else _initTween(t._startAt,X,X);for(t._pt=t._ptCache=0,T=C&&w(T)||T&&!C,n=0;n<S.length;n++){if(h=(o=S[n])._gsap||ga(S)[n]._gsap,t._ptLookup[n]=c={},_t[h.id]&&pt.length&&oa(),d=D===S?n:D.indexOf(o),l&&!1!==(f=new l).init(o,p||i,t,d,D)&&(t._pt=s=new we(t._pt,o,f.name,0,1,f.render,f,0,f.priority),f._props.forEach(function(t){c[t]=s}),f.priority&&(u=1)),!l||p)for(a in i)mt[a]&&(f=cc(a,i,t,d,o,D))?f.priority&&(u=1):c[a]=s=Ht.call(t,o,a,"get",i[a],d,D,0,m.stringFilter);t._op&&t._op[n]&&t.kill(o,t._op[n]),z&&t._pt&&(Zt=t,I.killTweensOf(o,c,t.globalTime(e)),_=!t.parent,Zt=0),t._pt&&T&&(_t[h.id]=1)}u&&be(t),t._onInit&&t._onInit(t)}t._onUpdate=b,t._initted=(!t._op||t._pt)&&!_,O&&e<=0&&R.render(q,!0,!0)},Qt=function _parseFuncOrString(t,e,i,n,a){return s(t)?t.call(e,i,n,a):r(t)&&~t.indexOf("random(")?rb(t):t},Jt=Tt+"repeat,repeatDelay,yoyo,repeatRefresh,yoyoEase,easeReverse,autoRevert",Kt={};ja(Jt+",id,stagger,delay,duration,paused,scrollTrigger",function(t){return Kt[t]=1}),Jt=Jt.split(",");var te=function(E){function Tween(e,r,i,n){var a;"number"==typeof r&&(i.duration=r,r=i,i=null);var s,o,u,h,l,f,c,d,p=(a=E.call(this,n?r:ya(r))||this).vars,_=p.duration,m=p.delay,g=p.immediateRender,b=p.stagger,x=p.overwrite,k=p.keyframes,O=p.defaults,M=p.scrollTrigger,C=r.parent||I,P=(K(e)||J(e)?t(e[0]):"length"in r)?[e]:Pt(e);if(a._targets=P.length?ga(P):T("GSAP target "+e+" not found. https://gsap.com",!Y.nullTargetWarn)||[],a._ptLookup=[],a._overwrite=x,k||b||y(_)||y(m)){var S=(r=a.vars).easeReverse||r.yoyoEase;if((s=a.timeline=new Gt({data:"nested",defaults:O||{},targets:C&&"nested"===C.data?C.vars.targets:P})).kill(),s.parent=s._dp=_assertThisInitialized(a),s._start=0,b||y(_)||y(m)){if(h=P.length,c=b&&hb(b),v(b))for(l in b)~Jt.indexOf(l)&&((d=d||{})[l]=b[l]);for(o=0;o<h;o++)(u=xa(r,Kt)).stagger=0,S&&(u.easeReverse=S),d&&bt(u,d),f=P[o],u.duration=+Qt(_,_assertThisInitialized(a),o,f,P),u.delay=(+Qt(m,_assertThisInitialized(a),o,f,P)||0)-a._delay,!b&&1===h&&u.delay&&(a._delay=m=u.delay,a._start+=m,u.delay=0),s.to(f,u,c?c(o,f,P):0),s._ease=Bt.none;s.duration()?_=m=0:a.timeline=0}else if(k){ya(ta(s.vars.defaults,{ease:"none"})),s._ease=jt(k.ease||r.ease||"none");var A,D,z,R=0;if(K(k))k.forEach(function(t){return s.to(P,t,">")}),s.duration();else{for(l in u={},k)"ease"===l||"easeEach"===l||ic(l,k[l],u,k.easeEach);for(l in u)for(A=u[l].sort(function(t,e){return t.t-e.t}),o=R=0;o<A.length;o++)(z={ease:(D=A[o]).e,duration:(D.t-(o?A[o-1].t:0))/100*_})[l]=D.v,s.to(P,z,R),R+=z.duration;s.duration()<_&&s.to({},{duration:_-s.duration()})}}_||a.duration(_=s.duration())}else a.timeline=0;return!0!==x||F||(Zt=_assertThisInitialized(a),I.killTweensOf(P),Zt=0),Na(C,_assertThisInitialized(a),i),r.reversed&&a.reverse(),r.paused&&a.paused(!0),(g||!_&&!k&&a._start===la(C._time)&&w(g)&&function _hasNoPausedAncestors(t){return!t||t._ts&&_hasNoPausedAncestors(t.parent)}(_assertThisInitialized(a))&&"nested"!==C.data)&&(a._tTime=-X,a.render(Math.max(0,-m)||0)),M&&Oa(_assertThisInitialized(a),M),a}_inheritsLoose(Tween,E);var e=Tween.prototype;return e.render=function render(t,e,r){var i,n,a,s,o,u,h,l,f=this._time,c=this._tDur,d=this._dur,p=t<0,_=c-X<t&&!p?c:t<X?0:t;if(d){if(_!==this._tTime||!t||r||!this._initted&&this._tTime||this._startAt&&this._zTime<0!=p||this._lazy){if(i=_,l=this.timeline,this._repeat){if(s=d+this._rDelay,this._repeat<-1&&p)return this.totalTime(100*s+t,e,r);if(i=la(_%s),_===c?(a=this._repeat,i=d):(a=~~(o=la(_/s)))&&a===o?(i=d,a--):d<i&&(i=d),(u=this._yoyo&&1&a)&&(i=d-i),o=wt(this._tTime,s),i===f&&!r&&this._initted&&a===o)return this._tTime=_,this;a!==o&&this.vars.repeatRefresh&&!u&&!this._lock&&i!==s&&this._initted&&(this._lock=r=1,this.render(la(s*a),!0).invalidate()._lock=0)}if(!this._initted){if(Pa(this,p?t:i,r,e,_))return this._tTime=0,this;if(!(f===this._time||r&&this.vars.repeatRefresh&&a!==o))return this;if(d!==this._dur)return this.render(t,e,r)}if(this._rEase){var m=i<f;if(m!==this._inv){var g=m?f:d-f;this._inv=m,this._from&&(this.ratio=1-this.ratio),this._invRatio=this.ratio,this._invTime=f,this._invRecip=g?(m?-1:1)/g:0,this._invScale=m?-this.ratio:1-this.ratio,this._invEase=m?this._rEase:this._ease}this.ratio=h=this._invRatio+this._invScale*this._invEase((i-this._invTime)*this._invRecip)}else this.ratio=h=this._ease(i/d);if(this._from&&(this.ratio=h=1-h),this._tTime=_,this._time=i,!this._act&&this._ts&&(this._act=1,this._lazy=0),!f&&_&&!e&&!o&&(At(this,"onStart"),this._tTime!==_))return this;for(n=this._pt;n;)n.r(h,n.d),n=n._next;l&&l.render(t<0?t:l._dur*l._ease(i/this._dur),e,r)||this._startAt&&(this._zTime=t),this._onUpdate&&!e&&(p&&Fa(this,t,0,r),At(this,"onUpdate")),this._repeat&&a!==o&&this.vars.onRepeat&&!e&&this.parent&&At(this,"onRepeat"),_!==this._tDur&&_||this._tTime!==_||(p&&!this._onUpdate&&Fa(this,t,0,!0),!t&&d||!(_===this._tDur&&0<this._ts||!_&&this._ts<0)||Ca(this,1),e||p&&!f||!(_||f||u)||(At(this,_===c?"onComplete":"onReverseComplete",!0),!this._prom||_<c&&0<this.timeScale()||this._prom()))}}else!function _renderZeroDurationTween(t,e,r,i){var n,a,s,o=t.ratio,u=e<0||!e&&(!t._start&&function _parentPlayheadIsBeforeStart(t){var e=t.parent;return e&&e._ts&&e._initted&&!e._lock&&(e.rawTime()<0||_parentPlayheadIsBeforeStart(e))}(t)&&(t._initted||!xt(t))||(t._ts<0||t._dp._ts<0)&&!xt(t))?0:1,h=t._rDelay,l=0;if(h&&t._repeat&&(l=Mt(0,t._tDur,e),a=wt(l,h),t._yoyo&&1&a&&(u=1-u),a!==wt(t._tTime,h)&&(o=1-u,t.vars.repeatRefresh&&t._initted&&t.invalidate())),u!==o||L||i||t._zTime===X||!e&&t._zTime){if(!t._initted&&Pa(t,e,i,r,l))return;for(s=t._zTime,t._zTime=e||(r?X:0),r=r||e&&!s,t.ratio=u,t._from&&(u=1-u),t._time=0,t._tTime=l,n=t._pt;n;)n.r(u,n.d),n=n._next;e<0&&Fa(t,e,0,!0),t._onUpdate&&!r&&At(t,"onUpdate"),l&&t._repeat&&!r&&t.parent&&At(t,"onRepeat"),(e>=t._tDur||e<0)&&t.ratio===u&&(u&&Ca(t,1),r||L||(At(t,u?"onComplete":"onReverseComplete",!0),t._prom&&t._prom()))}else t._zTime||(t._zTime=e)}(this,t,e,r);return this},e.targets=function targets(){return this._targets},e.invalidate=function invalidate(t){return t&&this.vars.runBackwards||(this._startAt=0),this._pt=this._op=this._onUpdate=this._lazy=this.ratio=0,this._ptLookup=[],this.timeline&&this.timeline.invalidate(t),E.prototype.invalidate.call(this,t)},e.resetTo=function resetTo(t,e,r,i,n){d||Lt.wake(),this._ts||this.play();var a,s=Math.min(this._dur,(this._dp._time-this._start)*this._ts);return this._initted||$t(this,s),a=this._ease(s/this._dur),function _updatePropTweens(t,e,r,i,n,a,s,o){var u,h,l,f,c=(t._pt&&t._ptCache||(t._ptCache={}))[e];if(!c)for(c=t._ptCache[e]=[],l=t._ptLookup,f=t._targets.length;f--;){if((u=l[f][e])&&u.d&&u.d._pt)for(u=u.d._pt;u&&u.p!==e&&u.fp!==e;)u=u._next;if(!u)return Wt=1,t.vars[e]="+=0",$t(t,s),Wt=0,o?T(e+" not eligible for reset. Try splitting into individual properties"):1;c.push(u)}for(f=c.length;f--;)(u=(h=c[f])._pt||h).s=!i&&0!==i||n?u.s+(i||0)+a*u.c:i,u.c=r-u.s,h.e&&(h.e=ka(r)+_a(h.e)),h.b&&(h.b=u.s+_a(h.b))}(this,t,e,r,i,a,s,n)?this.resetTo(t,e,r,i,1):(La(this,0),this.parent||Aa(this._dp,this,"_first","_last",this._dp._sort?"_start":0),this.render(0))},e.kill=function kill(t,e){if(void 0===e&&(e="all"),!(t||e&&"all"!==e))return this._lazy=this._pt=0,this.parent?wb(this):this.scrollTrigger&&this.scrollTrigger.kill(!!L),this;if(this.timeline){var i=this.timeline.totalDuration();return this.timeline.killTweensOf(t,e,Zt&&!0!==Zt.vars.overwrite)._first||wb(this),this.parent&&i!==this.timeline.totalDuration()&&Ua(this,this._dur*this.timeline._tDur/i,0,1),this}var n,a,s,o,u,h,l,f=this._targets,c=t?Pt(t):f,d=this._ptLookup,p=this._pt;if((!e||"all"===e)&&function _arraysMatch(t,e){for(var r=t.length,i=r===e.length;i&&r--&&t[r]===e[r];);return r<0}(f,c))return"all"===e&&(this._pt=0),wb(this);for(n=this._op=this._op||[],"all"!==e&&(r(e)&&(u={},ja(e,function(t){return u[t]=1}),e=u),e=function _addAliasesToVars(t,e){var r,i,n,a,s=t[0]?ha(t[0]).harness:0,o=s&&s.aliases;if(!o)return e;for(i in r=bt({},e),o)if(i in r)for(n=(a=o[i].split(",")).length;n--;)r[a[n]]=r[i];return r}(f,e)),l=f.length;l--;)if(~c.indexOf(f[l]))for(u in a=d[l],"all"===e?(n[l]=e,o=a,s={}):(s=n[l]=n[l]||{},o=e),o)(h=a&&a[u])&&("kill"in h.d&&!0!==h.d.kill(u)||Ba(this,h,"_pt"),delete a[u]),"all"!==s&&(s[u]=1);return this._initted&&!this._pt&&p&&wb(this),this},Tween.to=function to(t,e,r){return new Tween(t,e,r)},Tween.from=function from(t,e){return Ya(1,arguments)},Tween.delayedCall=function delayedCall(t,e,r,i){return new Tween(e,0,{immediateRender:!1,lazy:!1,overwrite:!1,delay:t,onComplete:e,onReverseComplete:e,onCompleteParams:r,onReverseCompleteParams:r,callbackScope:i})},Tween.fromTo=function fromTo(t,e,r){return Ya(2,arguments)},Tween.set=function set(t,e){return e.duration=0,e.repeatDelay||(e.repeat=0),new Tween(t,e)},Tween.killTweensOf=function killTweensOf(t,e,r){return I.killTweensOf(t,e,r)},Tween}(Xt);ta(te.prototype,{_targets:[],_lazy:0,_startAt:0,_op:0,_onInit:0}),ja("staggerTo,staggerFrom,staggerFromTo",function(r){te[r]=function(){var t=new Gt,e=Ct.call(arguments,0);return e.splice("staggerFromTo"===r?5:4,0,0),t[r].apply(t,e)}});function qc(t,e,r){return t.setAttribute(e,r)}function yc(t,e,r,i){i.mSet(t,e,i.m.call(i.tween,r,i.mt),i)}var ie=function _setterPlain(t,e,r){return t[e]=r},ae=function _setterFunc(t,e,r){return t[e](r)},se=function _setterFuncWithParam(t,e,r,i){return t[e](i.fp,r)},ue=function _getSetter(t,e){return s(t[e])?ae:u(t[e])&&t.setAttribute?qc:ie},fe=function _renderPlain(t,e){return e.set(e.t,e.p,Math.round(1e6*(e.s+e.c*t))/1e6,e)},de=function _renderBoolean(t,e){return e.set(e.t,e.p,!!(e.s+e.c*t),e)},pe=function _renderComplexString(t,e){var r=e._pt,i="";if(!t&&e.b)i=e.b;else if(1===t&&e.e)i=e.e;else{for(;r;)i=r.p+(r.m?r.m(r.s+r.c*t):Math.round(1e4*(r.s+r.c*t))/1e4)+i,r=r._next;i+=e.c}e.set(e.t,e.p,i,e)},_e=function _renderPropTweens(t,e){for(var r=e._pt;r;)r.r(t,r.d),r=r._next},ve=function _addPluginModifier(t,e,r,i){for(var n,a=this._pt;a;)n=a._next,a.p===i&&a.modifier(t,e,r),a=n},Te=function _killPropTweensOf(t){for(var e,r,i=this._pt;i;)r=i._next,i.p===t&&!i.op||i.op===t?Ba(this,i,"_pt"):i.dep||(e=1),i=r;return!e},be=function _sortPropTweensByPriority(t){for(var e,r,i,n,a=t._pt;a;){for(e=a._next,r=i;r&&r.pr>a.pr;)r=r._next;(a._prev=r?r._prev:n)?a._prev._next=a:i=a,(a._next=r)?r._prev=a:n=a,a=e}t._pt=i},we=(PropTween.prototype.modifier=function modifier(t,e,r){this.mSet=this.mSet||this.set,this.set=yc,this.m=t,this.mt=r,this.tween=e},PropTween);function PropTween(t,e,r,i,n,a,s,o,u){this.t=e,this.s=i,this.c=n,this.p=r,this.r=a||fe,this.d=s||this,this.set=o||ie,this.pr=u||0,(this._next=t)&&(t._prev=this)}ja(Tt+"parent,duration,ease,delay,overwrite,runBackwards,startAt,yoyo,immediateRender,repeat,repeatDelay,data,paused,reversed,lazy,callbackScope,stringFilter,id,yoyoEase,stagger,inherit,repeatRefresh,keyframes,autoRevert,scrollTrigger,easeReverse",function(t){return dt[t]=1}),ht.TweenMax=ht.TweenLite=te,ht.TimelineLite=ht.TimelineMax=Gt,I=new Gt({sortChildren:!1,defaults:j,autoRemoveChildren:!0,id:"root",smoothChildTiming:!0}),Y.stringFilter=Ib;function Gc(t){return(Oe[t]||Me).map(function(t){return t()})}function Hc(){var t=Date.now(),o=[];2<t-Ce&&(Gc("matchMediaInit"),ke.forEach(function(t){var e,r,i,n,a=t.queries,s=t.conditions;for(r in a)(e=h.matchMedia(a[r]).matches)&&(i=1),e!==s[r]&&(s[r]=e,n=1);n&&(t.revert(),i&&o.push(t))}),Gc("matchMediaRevert"),o.forEach(function(e){return e.onMatch(e,function(t){return e.add(null,t)})}),Ce=t,Gc("matchMedia"))}var xe,ke=[],Oe={},Me=[],Ce=0,Pe=0,Se=((xe=Context.prototype).add=function add(t,i,n){function Lw(){var t,e=l,r=a.selector;return e&&e!==a&&e.data.push(a),n&&(a.selector=fb(n)),l=a,t=i.apply(a,arguments),s(t)&&a._r.push(t),l=e,a.selector=r,a.isReverted=!1,t}s(t)&&(n=i,i=t,t=s);var a=this;return a.last=Lw,t===s?Lw(a,function(t){return a.add(null,t)}):t?a[t]=Lw:Lw},xe.ignore=function ignore(t){var e=l;l=null,t(this),l=e},xe.getTweens=function getTweens(){var e=[];return this.data.forEach(function(t){return t instanceof Context?e.push.apply(e,t.getTweens()):t instanceof te&&!(t.parent&&"nested"===t.parent.data)&&e.push(t)}),e},xe.clear=function clear(){this._r.length=this.data.length=0},xe.kill=function kill(i,t){var n=this;if(i?function(){for(var t,e=n.getTweens(),r=n.data.length;r--;)"isFlip"===(t=n.data[r]).data&&(t.revert(),t.getChildren(!0,!0,!1).forEach(function(t){return e.splice(e.indexOf(t),1)}));for(e.map(function(t){return{g:t._dur||t._delay||t._sat&&!t._sat.vars.immediateRender?t.globalTime(0):-1/0,t:t}}).sort(function(t,e){return e.g-t.g||-1/0}).forEach(function(t){return t.t.revert(i)}),r=n.data.length;r--;)(t=n.data[r])instanceof Gt?"nested"!==t.data&&(t.scrollTrigger&&t.scrollTrigger.revert(),t.kill()):t instanceof te||!t.revert||t.revert(i);n._r.forEach(function(t){return t(i,n)}),n.isReverted=!0}():this.data.forEach(function(t){return t.kill&&t.kill()}),this.clear(),t){for(var e=ke.length;e--;)ke[e].id===this.id&&ke.splice(e,1);this._mqs&&this._mqs.forEach(function(t){return t.removeListener?t.removeListener(Hc):t.removeEventListener("change",Hc)}),this._mqs=null}},xe.revert=function revert(t){this.kill(t||{})},Context);function Context(t,e){this.selector=e&&fb(e),this.data=[],this._r=[],this.isReverted=!1,this.id=Pe++,t&&this.add(t)}var De,Re=((De=MatchMedia.prototype).add=function add(t,e,r){v(t)||(t={matches:t});var i,n,a,s=new Se(0,r||this.scope),o=s.conditions={};for(n in l&&!s.selector&&(s.selector=l.selector),this.contexts.push(s),e=s.add("onMatch",e),s.queries=t)"all"===n?a=1:(i=h.matchMedia(t[n]))&&(ke.indexOf(s)<0&&ke.push(s),(o[n]=i.matches)&&(a=1),i.addListener?i.addListener(Hc):i.addEventListener("change",Hc),(s._mqs||(s._mqs=[])).push(i));return a&&e(s,function(t){return s.add(null,t)}),this},De.revert=function revert(t){this.kill(t||{})},De.kill=function kill(e){this.contexts.forEach(function(t){return t.kill(e,!0)})},MatchMedia);function MatchMedia(t){this.contexts=[],this.scope=t,l&&l.data.push(this)}var Ee={registerPlugin:function registerPlugin(){for(var t=arguments.length,e=new Array(t),r=0;r<t;r++)e[r]=arguments[r];e.forEach(function(t){return zb(t)})},timeline:function timeline(t){return new Gt(t)},getTweensOf:function getTweensOf(t,e){return I.getTweensOf(t,e)},getProperty:function getProperty(i,t,e,n){r(i)&&(i=Pt(i)[0]);var a=ha(i||{}).get,s=e?sa:ra;return"native"===e&&(e=""),i?t?s((mt[t]&&mt[t].get||a)(i,t,e,n)):function(t,e,r){return s((mt[t]&&mt[t].get||a)(i,t,e,r))}:i},quickSetter:function quickSetter(r,e,i){if(1<(r=Pt(r)).length){var n=r.map(function(t){return Fe.quickSetter(t,e,i)}),a=n.length;return function(t){for(var e=a;e--;)n[e](t)}}r=r[0]||{};var s=mt[e],o=ha(r),u=o.harness&&(o.harness.aliases||{})[e]||e,h=s?function(t){var e=new s;c._pt=0,e.init(r,i?t+i:t,c,0,[r]),e.render(1,e),c._pt&&_e(1,c)}:o.set(r,u);return s?h:function(t){return h(r,u,i?t+i:t,o,1)}},quickTo:function quickTo(t,i,e){function ey(t,e,r){return n.resetTo(i,t,e,r)}var r,n=Fe.to(t,ta(((r={})[i]="+=0.1",r.paused=!0,r.stagger=0,r),e||{}));return ey.tween=n,ey},isTweening:function isTweening(t){return 0<I.getTweensOf(t,!0).length},defaults:function defaults(t){return t&&t.ease&&(t.ease=jt(t.ease,j.ease)),wa(j,t||{})},config:function config(t){return wa(Y,t||{})},registerEffect:function registerEffect(t){var i=t.name,n=t.effect,e=t.plugins,a=t.defaults,r=t.extendTimeline;(e||"").split(",").forEach(function(t){return t&&!mt[t]&&!ht[t]&&T(i+" effect requires "+t+" plugin.")}),gt[i]=function(t,e,r){return n(Pt(t),ta(e||{},a),r)},r&&(Gt.prototype[i]=function(t,e,r){return this.add(gt[i](t,v(e)?e:(r=e)&&{},this),r)})},registerEase:function registerEase(t,e){Bt[t]=jt(e)},parseEase:function parseEase(t,e){return arguments.length?jt(t,e):Bt},getById:function getById(t){return I.getById(t)},exportRoot:function exportRoot(t,e){void 0===t&&(t={});var r,i,n=new Gt(t);for(n.smoothChildTiming=w(t.smoothChildTiming),I.remove(n),n._dp=0,n._time=n._tTime=I._time,r=I._first;r;)i=r._next,!e&&!r._dur&&r instanceof te&&r.vars.onComplete===r._targets[0]||Na(n,r,r._start-r._delay),r=i;return Na(I,n,0),n},context:function context(t,e){return t?new Se(t,e):l},matchMedia:function matchMedia(t){return new Re(t)},matchMediaRefresh:function matchMediaRefresh(){return ke.forEach(function(t){var e,r,i=t.conditions;for(r in i)i[r]&&(i[r]=!1,e=1);e&&t.revert()})||Hc()},addEventListener:function addEventListener(t,e){var r=Oe[t]||(Oe[t]=[]);~r.indexOf(e)||r.push(e)},removeEventListener:function removeEventListener(t,e){var r=Oe[t],i=r&&r.indexOf(e);0<=i&&r.splice(i,1)},utils:{wrap:function wrap(e,t,r){var i=t-e;return K(e)?ob(e,wrap(0,e.length),t):Za(r,function(t){return(i+(t-e)%i)%i+e})},wrapYoyo:function wrapYoyo(e,t,r){var i=t-e,n=2*i;return K(e)?ob(e,wrapYoyo(0,e.length-1),t):Za(r,function(t){return e+(i<(t=(n+(t-e)%n)%n||0)?n-t:t)})},distribute:hb,random:kb,snap:jb,normalize:function normalize(t,e,r){return St(t,e,0,1,r)},getUnit:_a,clamp:function clamp(e,r,t){return Za(t,function(t){return Mt(e,r,t)})},splitColor:Db,toArray:Pt,selector:fb,mapRange:St,pipe:function pipe(){for(var t=arguments.length,e=new Array(t),r=0;r<t;r++)e[r]=arguments[r];return function(t){return e.reduce(function(t,e){return e(t)},t)}},unitize:function unitize(e,r){return function(t){return e(parseFloat(t))+(r||_a(t))}},interpolate:function interpolate(e,i,t,n){var a=isNaN(e+i)?0:function(t){return(1-t)*e+t*i};if(!a){var s,o,u,h,l,f=r(e),c={};if(!0===t&&(n=1)&&(t=null),f)e={p:e},i={p:i};else if(K(e)&&!K(i)){for(u=[],h=e.length,l=h-2,o=1;o<h;o++)u.push(interpolate(e[o-1],e[o]));h--,a=function func(t){t*=h;var e=Math.min(l,~~t);return u[e](t-e)},t=i}else n||(e=bt(K(e)?[]:{},e));if(!u){for(s in i)Ht.call(c,e,s,"get",i[s]);a=function func(t){return _e(t,c)||(f?e.p:e)}}}return Za(t,a)},shuffle:gb},install:R,effects:gt,ticker:Lt,updateRoot:Gt.updateRoot,plugins:mt,globalTimeline:I,core:{PropTween:we,globals:U,Tween:te,Timeline:Gt,Animation:Xt,getCache:ha,_removeLinkedListItem:Ba,reverting:function reverting(){return L},context:function context(t){return t&&l&&(l.data.push(t),t._ctx=l),l},suppressOverwrites:function suppressOverwrites(t){return F=t}}};ja("to,from,fromTo,delayedCall,set,killTweensOf",function(t){return Ee[t]=te[t]}),Lt.add(Gt.updateRoot),c=Ee.to({},{duration:0});function Lc(t,e){for(var r=t._pt;r&&r.p!==e&&r.op!==e&&r.fp!==e;)r=r._next;return r}function Nc(t,a){return{name:t,headless:1,rawVars:1,init:function init(t,n,e){e._onInit=function(t){var e,i;if(r(n)&&(e={},ja(n,function(t){return e[t]=1}),n=e),a){for(i in e={},n)e[i]=a(n[i]);n=e}!function _addModifiers(t,e){var r,i,n,a=t._targets;for(r in e)for(i=a.length;i--;)(n=(n=t._ptLookup[i][r])&&n.d)&&(n._pt&&(n=Lc(n,r)),n&&n.modifier&&n.modifier(e[r],t,a[i],r))}(t,n)}}}}var Fe=Ee.registerPlugin({name:"attr",init:function init(t,e,r,i,n){var a,s,o;for(a in this.tween=r,e)o=t.getAttribute(a)||"",(s=this.add(t,"setAttribute",(o||0)+"",e[a],i,n,0,0,a)).op=a,s.b=o,this._props.push(a)},render:function render(t,e){for(var r=e._pt;r;)L?r.set(r.t,r.p,r.b,r):r.r(t,r.d),r=r._next}},{name:"endArray",headless:1,init:function init(t,e){for(var r=e.length;r--;)this.add(t,r,t[r]||0,e[r],0,0,0,0,0,1)}},Nc("roundProps",ib),Nc("modifiers"),Nc("snap",jb))||Ee;te.version=Gt.version=Fe.version="3.15.1",o=1,x()&&It();function xd(t,e){return e.set(e.t,e.p,Math.round(1e4*(e.s+e.c*t))/1e4+e.u,e)}function yd(t,e){return e.set(e.t,e.p,1===t?e.e:Math.round(1e4*(e.s+e.c*t))/1e4+e.u,e)}function zd(t,e){return e.set(e.t,e.p,t?Math.round(1e4*(e.s+e.c*t))/1e4+e.u:e.b,e)}function Ad(t,e){return e.set(e.t,e.p,1===t?e.e:t?Math.round(1e4*(e.s+e.c*t))/1e4+e.u:e.b,e)}function Bd(t,e){var r=e.s+e.c*t;e.set(e.t,e.p,~~(r+(r<0?-.5:.5))+e.u,e)}function Cd(t,e){return e.set(e.t,e.p,t?e.e:e.b,e)}function Dd(t,e){return e.set(e.t,e.p,1!==t?e.b:e.e,e)}function Ed(t,e,r){return t.style[e]=r}function Fd(t,e,r){return t.style.setProperty(e,r)}function Gd(t,e,r){return t._gsap[e]=r}function Hd(t,e,r){return t._gsap.scaleX=t._gsap.scaleY=r}function Id(t,e,r,i,n){var a=t._gsap;a.scaleX=a.scaleY=r,a.renderTransform(n,a)}function Jd(t,e,r,i,n){var a=t._gsap;a[e]=r,a.renderTransform(n,a)}function Md(t,e){var r=this,i=this.target,n=i.style,a=i._gsap;if(t in ur&&n){if(this.tfm=this.tfm||{},"transform"===t)return _r.transform.split(",").forEach(function(t){return Md.call(r,t,e)});if(~(t=_r[t]||t).indexOf(",")?t.split(",").forEach(function(t){return r.tfm[t]=wr(i,t)}):this.tfm[t]=a.x?a[t]:wr(i,t),t===gr&&(this.tfm.zOrigin=a.zOrigin),0<=this.props.indexOf(mr))return;a.svg&&(this.svgo=i.getAttribute("data-svg-origin"),this.props.push(gr,e,"")),t=mr}(n||e)&&this.props.push(t,e,n[t])}function Nd(t){t.translate&&(t.removeProperty("translate"),t.removeProperty("scale"),t.removeProperty("rotate"))}function Od(){var t,e,r=this.props,i=this.target,n=i.style,a=i._gsap;for(t=0;t<r.length;t+=3)r[t+1]?2===r[t+1]?i[r[t]](r[t+2]):i[r[t]]=r[t+2]:r[t+2]?n[r[t]]=r[t+2]:n.removeProperty("--"===r[t].substr(0,2)?r[t]:r[t].replace(cr,"-$1").toLowerCase());if(this.tfm){for(e in this.tfm)a[e]=this.tfm[e];a.svg&&(a.renderTransform(),i.setAttribute("data-svg-origin",this.svgo||"")),(t=je())&&t.isStart||n[mr]||(Nd(n),a.zOrigin&&n[gr]&&(n[gr]+=" "+a.zOrigin+"px",a.zOrigin=0,a.renderTransform()),a.uncache=1)}}function Pd(t,e){var r={target:t,props:[],revert:Od,save:Md};return t._gsap||Fe.core.getCache(t),e&&t.style&&t.nodeType&&e.split(",").forEach(function(t){return r.save(t)}),r}function Rd(t,e){var r=Ie.createElementNS?Ie.createElementNS((e||"http://www.w3.org/1999/xhtml").replace(/^https/,"http"),t):Ie.createElement(t);return r&&r.style?r:Ie.createElement(t)}function Sd(t,e,r){var i=getComputedStyle(t);return i[e]||i.getPropertyValue(e.replace(cr,"-$1").toLowerCase())||i.getPropertyValue(e)||!r&&Sd(t,yr(e)||e,1)||""}function Vd(){(function _windowExists(){return"undefined"!=typeof window})()&&window.document&&(Le=window,Ie=Le.document,Be=Ie.documentElement,Ue=Rd("div")||{style:{}},Rd("div"),mr=yr(mr),gr=mr+"Origin",Ue.style.cssText="border-width:0;line-height:0;position:absolute;padding:0",Ve=!!yr("perspective"),je=Fe.core.reverting,Ne=1)}function Wd(t){var e,r=t.ownerSVGElement,i=Rd("svg",r&&r.getAttribute("xmlns")||"http://www.w3.org/2000/svg"),n=t.cloneNode(!0);n.style.display="block",i.appendChild(n),Be.appendChild(i);try{e=n.getBBox()}catch(t){}return i.removeChild(n),Be.removeChild(i),e}function Xd(t,e){for(var r=e.length;r--;)if(t.hasAttribute(e[r]))return t.getAttribute(e[r])}function Yd(e){var r,i;try{r=e.getBBox()}catch(t){r=Wd(e),i=1}return r&&(r.width||r.height)||i||(r=Wd(e)),!r||r.width||r.x||r.y?r:{x:+Xd(e,["x","cx","x1"])||0,y:+Xd(e,["y","cy","y1"])||0,width:0,height:0}}function Zd(t){return!(!t.getCTM||t.parentNode&&!t.ownerSVGElement||!Yd(t))}function $d(t,e){if(e){var r,i=t.style;e in ur&&e!==gr&&(e=mr),i.removeProperty?("ms"!==(r=e.substr(0,2))&&"webkit"!==e.substr(0,6)||(e="-"+e),i.removeProperty("--"===r?e:e.replace(cr,"-$1").toLowerCase())):i.removeAttribute(e)}}function _d(t,e,r,i,n,a){var s=new we(t._pt,e,r,0,1,a?Dd:Cd);return(t._pt=s).b=i,s.e=n,t._props.push(r),s}function ce(t,e,r,i){var n,a,s,o,u=parseFloat(r)||0,h=(r+"").trim().substr((u+"").length)||"px",l=Ue.style,f=dr.test(e),c="svg"===t.tagName.toLowerCase(),d=(c?"client":"offset")+(f?"Width":"Height"),p="px"===i,_="%"===i;if(i===h||!u||Tr[i]||Tr[h])return u;if("px"===h||p||(u=ce(t,e,r,"px")),o=t.getCTM&&Zd(t),(_||"%"===h)&&(ur[e]||~e.indexOf("adius")))return n=o?t.getBBox()[f?"width":"height"]:t[d],ka(_?u/n*100:u/100*n);if(l[f?"width":"height"]=100+(p?h:i),a="rem"!==i&&~e.indexOf("adius")||"em"===i&&t.appendChild&&!c?t:t.parentNode,o&&(a=(t.ownerSVGElement||{}).parentNode),a&&a!==Ie&&a.appendChild||(a=Ie.body),(s=a._gsap)&&_&&s.width&&f&&s.time===Lt.time&&!s.uncache)return ka(u/s.width*100);if(!_||"height"!==e&&"width"!==e)!_&&"%"!==h||br[Sd(a,"display")]||(l.position=Sd(t,"position")),a===t&&(l.position="static"),a.appendChild(Ue),n=Ue[d],a.removeChild(Ue),l.position="absolute";else{var m=t.style[e];t.style[e]=100+i,n=t[d],m?t.style[e]=m:$d(t,e)}return f&&_&&((s=ha(a)).time=Lt.time,s.width=a[d]),ka(p?n*u/100:n&&u?100/n*u:0)}function ee(t,e,r,i){if(!r||"none"===r){var n=yr(e,t,1),a=n&&Sd(t,n,1);a&&a!==r?(e=n,r=a):"borderColor"===e&&(r=Sd(t,"borderTopColor"))}var s,o,u,h,l,f,c,d,p,_,m,g=new we(this._pt,t.style,e,0,1,pe),v=0,y=0;if(g.b=r,g.e=i,r+="","var(--"===(i+="").substring(0,6)&&(i=Sd(t,i.substring(4,i.indexOf(")")))),"auto"===i&&(f=t.style[e],t.style[e]=i,i=Sd(t,e)||i,f?t.style[e]=f:$d(t,e)),Ib(s=[r,i]),i=s[1],u=(r=s[0]).match(nt)||[],(i.match(nt)||[]).length){for(;o=nt.exec(i);)c=o[0],p=i.substring(v,o.index),l?l=(l+1)%5:"rgba("!==p.substr(-5)&&"hsla("!==p.substr(-5)||(l=1),c!==(f=u[y++]||"")&&(h=parseFloat(f)||0,m=f.substr((h+"").length),"="===c.charAt(1)&&(c=ma(h,c)+m),d=parseFloat(c),_=c.substr((d+"").length),v=nt.lastIndex-_.length,_||(_=_||Y.units[e]||m,v===i.length&&(i+=_,g.e+=_)),m!==_&&(h=ce(t,e,f,_)||0),g._pt={_next:g._pt,p:p||1===y?p:",",s:h,c:d-h,m:l&&l<4||"zIndex"===e?Math.round:0});g.c=v<i.length?i.substring(v,i.length):""}else g.r="display"===e&&"none"===i?Dd:Cd;return st.test(i)&&(g.e=0),this._pt=g}function ge(t){var e=t.split(" "),r=e[0],i=e[1]||"50%";return"top"!==r&&"bottom"!==r&&"left"!==i&&"right"!==i||(t=r,r=i,i=t),e[0]=xr[r]||r,e[1]=xr[i]||i,e.join(" ")}function he(t,e){if(e.tween&&e.tween._time===e.tween._dur){var r,i,n,a=e.t,s=a.style,o=e.u,u=a._gsap;if("all"===o||!0===o)s.cssText="",i=1;else for(n=(o=o.split(",")).length;-1<--n;)r=o[n],ur[r]&&(i=1,r="transformOrigin"===r?gr:mr),$d(a,r);i&&($d(a,mr),u&&(u.svg&&a.removeAttribute("transform"),s.scale=s.rotate=s.translate="none",Cr(a,1),u.uncache=1,Nd(s)))}}function le(t){return"matrix(1, 0, 0, 1, 0, 0)"===t||"none"===t||!t}function me(t){var e=Sd(t,mr);return le(e)?Or:e.substr(7).match(it).map(ka)}function ne(t,e){var r,i,n,a,s=t._gsap||ha(t),o=t.style,u=me(t);return s.svg&&t.getAttribute("transform")?"1,0,0,1,0,0"===(u=[(n=t.transform.baseVal.consolidate().matrix).a,n.b,n.c,n.d,n.e,n.f]).join(",")?Or:u:(u!==Or||t.offsetParent||t===Be||s.svg||(n=o.display,o.display="block",(r=t.parentNode)&&(t.offsetParent||t.getBoundingClientRect().width)||(a=1,i=t.nextElementSibling,Be.appendChild(t)),u=me(t),n?o.display=n:$d(t,"display"),a&&(i?r.insertBefore(t,i):r?r.appendChild(t):Be.removeChild(t))),e&&6<u.length?[u[0],u[1],u[4],u[5],u[12],u[13]]:u)}function oe(t,e,r,i,n,a){var s,o,u,h=t._gsap,l=n||ne(t,!0),f=h.xOrigin||0,c=h.yOrigin||0,d=h.xOffset||0,p=h.yOffset||0,_=l[0],m=l[1],g=l[2],v=l[3],y=l[4],T=l[5],b=e.split(" "),w=parseFloat(b[0])||0,x=parseFloat(b[1])||0;r?l!==Or&&(o=_*v-m*g)&&(u=w*(-m/o)+x*(_/o)-(_*T-m*y)/o,w=w*(v/o)+x*(-g/o)+(g*T-v*y)/o,x=u):(w=(s=Yd(t)).x+(~b[0].indexOf("%")?w/100*s.width:w),x=s.y+(~(b[1]||b[0]).indexOf("%")?x/100*s.height:x)),i||!1!==i&&h.smooth?(y=w-f,T=x-c,h.xOffset=d+(y*_+T*g)-y,h.yOffset=p+(y*m+T*v)-T):h.xOffset=h.yOffset=0,h.xOrigin=w,h.yOrigin=x,h.smooth=!!i,h.origin=e,h.originIsAbsolute=!!r,t.style[gr]="0px 0px",a&&(_d(a,h,"xOrigin",f,w),_d(a,h,"yOrigin",c,x),_d(a,h,"xOffset",d,h.xOffset),_d(a,h,"yOffset",p,h.yOffset)),t.setAttribute("data-svg-origin",w+" "+x)}function re(t,e,r){var i=_a(e);return ka(parseFloat(e)+parseFloat(ce(t,"x",r+"px",i)))+i}function ye(t,e,i,n,a){var s,o,u=360,h=r(a),l=parseFloat(a)*(h&&~a.indexOf("rad")?hr:1)-n,f=n+l+"deg";return h&&("short"===(s=a.split("_")[1])&&(l%=u)!==l%180&&(l+=l<0?u:-u),"cw"===s&&l<0?l=(l+36e9)%u-~~(l/u)*u:"ccw"===s&&0<l&&(l=(l-36e9)%u-~~(l/u)*u)),t._pt=o=new we(t._pt,e,i,n,l,yd),o.e=f,o.u="deg",t._props.push(i),o}function ze(t,e){for(var r in e)t[r]=e[r];return t}function Ae(t,e,r){var i,n,a,s,o,u,h,l=ze({},r._gsap),f=r.style;for(n in l.svg?(a=r.getAttribute("transform"),r.setAttribute("transform",""),f[mr]=e,i=Cr(r,1),$d(r,mr),r.setAttribute("transform",a)):(a=getComputedStyle(r)[mr],f[mr]=e,i=Cr(r,1),f[mr]=a),ur)(a=l[n])!==(s=i[n])&&"perspective,force3D,transformOrigin,svgOrigin".indexOf(n)<0&&(o=_a(a)!==(h=_a(s))?ce(r,n,a,h):parseFloat(a),u=parseFloat(s),t._pt=new we(t._pt,i,n,o,u-o,xd),t._pt.u=h||0,t._props.push(n));ze(i,l)}var Le,Ie,Be,Ne,Ue,Ye,je,Ve,qe=Bt.Power0,Xe=Bt.Power1,Ge=Bt.Power2,Ze=Bt.Power3,We=Bt.Power4,He=Bt.Linear,$e=Bt.Quad,Qe=Bt.Cubic,Je=Bt.Quart,Ke=Bt.Quint,tr=Bt.Strong,er=Bt.Elastic,rr=Bt.Back,ir=Bt.SteppedEase,nr=Bt.Bounce,ar=Bt.Sine,sr=Bt.Expo,or=Bt.Circ,ur={},hr=180/Math.PI,lr=Math.PI/180,fr=Math.atan2,cr=/([A-Z])/g,dr=/(left|right|width|margin|padding|x)/i,pr=/[\s,\(]\S/,_r={autoAlpha:"opacity,visibility",scale:"scaleX,scaleY",alpha:"opacity"},mr="transform",gr=mr+"Origin",vr="O,Moz,ms,Ms,Webkit".split(","),yr=function _checkPropPrefix(t,e,r){var i=(e||Ue).style,n=5;if(t in i&&!r)return t;for(t=t.charAt(0).toUpperCase()+t.substr(1);n--&&!(vr[n]+t in i););return n<0?null:(3===n?"ms":0<=n?vr[n]:"")+t},Tr={deg:1,rad:1,turn:1},br={grid:1,flex:1},wr=function _get(t,e,r,i){var n;return Ne||Vd(),e in _r&&"transform"!==e&&~(e=_r[e]).indexOf(",")&&(e=e.split(",")[0]),ur[e]&&"transform"!==e?(n=Cr(t,i),n="transformOrigin"!==e?n[e]:n.svg?n.origin:Pr(Sd(t,gr))+" "+n.zOrigin+"px"):(n=t.style[e])&&"auto"!==n&&!i&&!~(n+"").indexOf("calc(")||(n=kr[e]&&kr[e](t,e,r)||Sd(t,e)||ia(t,e)||("opacity"===e?1:0)),r&&!~(n+"").trim().indexOf(" ")?ce(t,e,n,r)+r:n},xr={top:"0%",bottom:"100%",left:"0%",right:"100%",center:"50%"},kr={clearProps:function clearProps(t,e,r,i,n){if("isFromStart"!==n.data){var a=t._pt=new we(t._pt,e,r,0,0,he);return a.u=i,a.pr=-10,a.tween=n,t._props.push(r),1}}},Or=[1,0,0,1,0,0],Mr={},Cr=function _parseTransform(t,e){var r=t._gsap||new qt(t);if("x"in r&&!e&&!r.uncache)return r;var i,n,a,s,o,u,h,l,f,c,d,p,_,m,g,v,y,T,b,w,x,k,O,M,C,P,S,A,D,z,R,E,F=t.style,L=r.scaleX<0,I="deg",B=getComputedStyle(t),N=Sd(t,gr)||"0";return i=n=a=u=h=l=f=c=d=0,s=o=1,r.svg=!(!t.getCTM||!Zd(t)),B.translate&&("none"===B.translate&&"none"===B.scale&&"none"===B.rotate||(F[mr]=("none"!==B.translate?"translate3d("+(B.translate+" 0 0").split(" ").slice(0,3).join(", ")+") ":"")+("none"!==B.rotate?"rotate("+B.rotate+") ":"")+("none"!==B.scale?"scale("+B.scale.split(" ").join(",")+") ":"")+("none"!==B[mr]?B[mr]:"")),F.scale=F.rotate=F.translate="none"),m=ne(t,r.svg),r.svg&&(M=r.uncache?(C=t.getBBox(),N=r.xOrigin-C.x+"px "+(r.yOrigin-C.y)+"px",""):!e&&t.getAttribute("data-svg-origin"),oe(t,M||N,!!M||r.originIsAbsolute,!1!==r.smooth,m)),p=r.xOrigin||0,_=r.yOrigin||0,m!==Or&&(T=m[0],b=m[1],w=m[2],x=m[3],i=k=m[4],n=O=m[5],6===m.length?(s=Math.sqrt(T*T+b*b),o=Math.sqrt(x*x+w*w),u=T||b?fr(b,T)*hr:0,(f=w||x?fr(w,x)*hr+u:0)&&(o*=Math.abs(Math.cos(f*lr))),r.svg&&(i-=p-(p*T+_*w),n-=_-(p*b+_*x))):(E=m[6],z=m[7],S=m[8],A=m[9],D=m[10],R=m[11],i=m[12],n=m[13],a=m[14],h=(g=fr(E,D))*hr,g&&(M=k*(v=Math.cos(-g))+S*(y=Math.sin(-g)),C=O*v+A*y,P=E*v+D*y,S=k*-y+S*v,A=O*-y+A*v,D=E*-y+D*v,R=z*-y+R*v,k=M,O=C,E=P),l=(g=fr(-w,D))*hr,g&&(v=Math.cos(-g),R=x*(y=Math.sin(-g))+R*v,T=M=T*v-S*y,b=C=b*v-A*y,w=P=w*v-D*y),u=(g=fr(b,T))*hr,g&&(M=T*(v=Math.cos(g))+b*(y=Math.sin(g)),C=k*v+O*y,b=b*v-T*y,O=O*v-k*y,T=M,k=C),h&&359.9<Math.abs(h)+Math.abs(u)&&(h=u=0,l=180-l),s=ka(Math.sqrt(T*T+b*b+w*w)),o=ka(Math.sqrt(O*O+E*E)),g=fr(k,O),f=2e-4<Math.abs(g)?g*hr:0,d=R?1/(R<0?-R:R):0),r.svg&&(M=t.getAttribute("transform"),r.forceCSS=t.setAttribute("transform","")||!le(Sd(t,mr)),M&&t.setAttribute("transform",M))),90<Math.abs(f)&&Math.abs(f)<270&&(L?(s*=-1,f+=u<=0?180:-180,u+=u<=0?180:-180):(o*=-1,f+=f<=0?180:-180)),e=e||r.uncache,r.x=i-((r.xPercent=i&&(!e&&r.xPercent||(Math.round(t.offsetWidth/2)===Math.round(-i)?-50:0)))?t.offsetWidth*r.xPercent/100:0)+"px",r.y=n-((r.yPercent=n&&(!e&&r.yPercent||(Math.round(t.offsetHeight/2)===Math.round(-n)?-50:0)))?t.offsetHeight*r.yPercent/100:0)+"px",r.z=a+"px",r.scaleX=ka(s),r.scaleY=ka(o),r.rotation=ka(u)+I,r.rotationX=ka(h)+I,r.rotationY=ka(l)+I,r.skewX=f+I,r.skewY=c+I,r.transformPerspective=d+"px",(r.zOrigin=parseFloat(N.split(" ")[2])||!e&&r.zOrigin||0)&&(F[gr]=Pr(N)),r.xOffset=r.yOffset=0,r.force3D=Y.force3D,r.renderTransform=r.svg?Er:Ve?Rr:Sr,r.uncache=0,r},Pr=function _firstTwoOnly(t){return(t=t.split(" "))[0]+" "+t[1]},Sr=function _renderNon3DTransforms(t,e){e.z="0px",e.rotationY=e.rotationX="0deg",e.force3D=0,Rr(t,e)},Ar="0deg",Dr="0px",zr=") ",Rr=function _renderCSSTransforms(t,e){var r=e||this,i=r.xPercent,n=r.yPercent,a=r.x,s=r.y,o=r.z,u=r.rotation,h=r.rotationY,l=r.rotationX,f=r.skewX,c=r.skewY,d=r.scaleX,p=r.scaleY,_=r.transformPerspective,m=r.force3D,g=r.target,v=r.zOrigin,y="",T="auto"===m&&t&&1!==t||!0===m;if(v&&(l!==Ar||h!==Ar)){var b,w=parseFloat(h)*lr,x=Math.sin(w),k=Math.cos(w);w=parseFloat(l)*lr,b=Math.cos(w),a=re(g,a,x*b*-v),s=re(g,s,-Math.sin(w)*-v),o=re(g,o,k*b*-v+v)}_!==Dr&&(y+="perspective("+_+zr),(i||n)&&(y+="translate("+i+"%, "+n+"%) "),!T&&a===Dr&&s===Dr&&o===Dr||(y+=o!==Dr||T?"translate3d("+a+", "+s+", "+o+") ":"translate("+a+", "+s+zr),u!==Ar&&(y+="rotate("+u+zr),h!==Ar&&(y+="rotateY("+h+zr),l!==Ar&&(y+="rotateX("+l+zr),f===Ar&&c===Ar||(y+="skew("+f+", "+c+zr),1===d&&1===p||(y+="scale("+d+", "+p+zr),g.style[mr]=y||"translate(0, 0)"},Er=function _renderSVGTransforms(t,e){var r,i,n,a,s,o=e||this,u=o.xPercent,h=o.yPercent,l=o.x,f=o.y,c=o.rotation,d=o.skewX,p=o.skewY,_=o.scaleX,m=o.scaleY,g=o.target,v=o.xOrigin,y=o.yOrigin,T=o.xOffset,b=o.yOffset,w=o.forceCSS,x=parseFloat(l),k=parseFloat(f);c=parseFloat(c),d=parseFloat(d),(p=parseFloat(p))&&(d+=p=parseFloat(p),c+=p),c||d?(c*=lr,d*=lr,r=Math.cos(c)*_,i=Math.sin(c)*_,n=Math.sin(c-d)*-m,a=Math.cos(c-d)*m,d&&(p*=lr,s=Math.tan(d-p),n*=s=Math.sqrt(1+s*s),a*=s,p&&(s=Math.tan(p),r*=s=Math.sqrt(1+s*s),i*=s)),r=ka(r),i=ka(i),n=ka(n),a=ka(a)):(r=_,a=m,i=n=0),(x&&!~(l+"").indexOf("px")||k&&!~(f+"").indexOf("px"))&&(x=ce(g,"x",l,"px"),k=ce(g,"y",f,"px")),(v||y||T||b)&&(x=ka(x+v-(v*r+y*n)+T),k=ka(k+y-(v*i+y*a)+b)),(u||h)&&(s=g.getBBox(),x=ka(x+u/100*s.width),k=ka(k+h/100*s.height)),s="matrix("+r+","+i+","+n+","+a+","+x+","+k+")",g.setAttribute("transform",s),w&&(g.style[mr]=s)};ja("padding,margin,Width,Radius",function(e,r){var t="Right",i="Bottom",n="Left",o=(r<3?["Top",t,i,n]:["Top"+n,"Top"+t,i+t,i+n]).map(function(t){return r<2?e+t:"border"+t+e});kr[1<r?"border"+e:e]=function(e,t,r,i,n){var a,s;if(arguments.length<4)return a=o.map(function(t){return wr(e,t,r)}),5===(s=a.join(" ")).split(a[0]).length?a[0]:s;a=(i+"").split(" "),s={},o.forEach(function(t,e){return s[t]=a[e]=a[e]||a[(e-1)/2|0]}),e.init(t,s,n)}});var Fr,Lr,Ir,Br={name:"css",register:Vd,targetTest:function targetTest(t){return t.style&&t.nodeType},init:function init(t,e,i,n,a){var s,o,u,h,l,f,c,d,p,_,m,g,v,y,T,b,w,x=this._props,k=t.style,O=i.vars.startAt;for(c in Ne||Vd(),this.styles=this.styles||Pd(t),b=this.styles.props,this.tween=i,e)if("autoRound"!==c&&(o=e[c],!mt[c]||!cc(c,e,i,n,t,a)))if(l=typeof o,f=kr[c],"function"===l&&(l=typeof(o=o.call(i,n,t,a))),"string"===l&&~o.indexOf("random(")&&(o=rb(o)),f)f(this,t,c,o,i)&&(T=1);else if("--"===c.substr(0,2))s=(getComputedStyle(t).getPropertyValue(c)+"").trim(),o+="",Et.lastIndex=0,Et.test(s)||(d=_a(s),(p=_a(o))?d!==p&&(s=ce(t,c,s,p)+p):d&&(o+=d)),this.add(k,"setProperty",s,o,n,a,0,0,c),x.push(c),b.push(c,0,k[c]);else if("undefined"!==l){if(O&&c in O?(s="function"==typeof O[c]?O[c].call(i,n,t,a):O[c],r(s)&&~s.indexOf("random(")&&(s=rb(s)),_a(s+"")||"auto"===s||(s+=Y.units[c]||_a(wr(t,c))||""),"="===(s+"").charAt(1)&&(s=wr(t,c))):s=wr(t,c),h=parseFloat(s),(_="string"===l&&"="===o.charAt(1)&&o.substr(0,2))&&(o=o.substr(2)),u=parseFloat(o),c in _r&&("autoAlpha"===c&&(1===h&&"hidden"===wr(t,"visibility")&&u&&(h=0),b.push("visibility",0,k.visibility),_d(this,k,"visibility",h?"inherit":"hidden",u?"inherit":"hidden",!u)),"scale"!==c&&"transform"!==c&&~(c=_r[c]).indexOf(",")&&(c=c.split(",")[0])),m=c in ur){if(this.styles.save(c),w=o,"string"===l&&"var(--"===o.substring(0,6)){if("calc("===(o=Sd(t,o.substring(4,o.indexOf(")")))).substring(0,5)){var M=t.style.perspective;t.style.perspective=o,o=Sd(t,"perspective"),M?t.style.perspective=M:$d(t,"perspective")}u=parseFloat(o)}if(g||((v=t._gsap).renderTransform&&!e.parseTransform||Cr(t,e.parseTransform),y=!1!==e.smoothOrigin&&v.smooth,(g=this._pt=new we(this._pt,k,mr,0,1,v.renderTransform,v,0,-1)).dep=1),"scale"===c)this._pt=new we(this._pt,v,"scaleY",v.scaleY,(_?ma(v.scaleY,_+u):u)-v.scaleY||0,xd),this._pt.u=0,x.push("scaleY",c),c+="X";else{if("transformOrigin"===c){b.push(gr,0,k[gr]),o=ge(o),v.svg?oe(t,o,0,y,0,this):((p=parseFloat(o.split(" ")[2])||0)!==v.zOrigin&&_d(this,v,"zOrigin",v.zOrigin,p),_d(this,k,c,Pr(s),Pr(o)));continue}if("svgOrigin"===c){oe(t,o,1,y,0,this);continue}if(c in Mr){ye(this,v,c,h,_?ma(h,_+o):o);continue}if("smoothOrigin"===c){_d(this,v,"smooth",v.smooth,o);continue}if("force3D"===c){v[c]=o;continue}if("transform"===c){Ae(this,o,t);continue}}}else c in k||(c=yr(c)||c);if(m||(u||0===u)&&(h||0===h)&&!pr.test(o)&&c in k)u=u||0,(d=(s+"").substr((h+"").length))!==(p=_a(o)||(c in Y.units?Y.units[c]:d))&&(h=ce(t,c,s,p)),this._pt=new we(this._pt,m?v:k,c,h,(_?ma(h,_+u):u)-h,m||"px"!==p&&"zIndex"!==c||!1===e.autoRound?xd:Bd),this._pt.u=p||0,m&&w!==o?(this._pt.b=s,this._pt.e=w,this._pt.r=Ad):d!==p&&"%"!==p&&(this._pt.b=s,this._pt.r=zd);else if(c in k)ee.call(this,t,c,s,_?_+o:o);else if(c in t)this.add(t,c,s||t[c],_?_+o:o,n,a);else if("parseTransform"!==c){S(c,o);continue}m||(c in k?b.push(c,0,k[c]):"function"==typeof t[c]?b.push(c,2,t[c]()):b.push(c,1,s||t[c])),x.push(c)}T&&be(this)},render:function render(t,e){if(e.tween._time||!je())for(var r=e._pt;r;)r.r(t,r.d),r=r._next;else e.styles.revert()},get:wr,aliases:_r,getSetter:function getSetter(t,e,r){var i=_r[e];return i&&i.indexOf(",")<0&&(e=i),e in ur&&e!==gr&&(t._gsap.x||wr(t,"x"))?r&&Ye===r?"scale"===e?Hd:Gd:(Ye=r||{})&&("scale"===e?Id:Jd):t.style&&!u(t.style[e])?Ed:~e.indexOf("-")?Fd:ue(t,e)},core:{_removeProperty:$d,_getMatrix:ne}};Fe.utils.checkPrefix=yr,Fe.core.getStyleSaver=Pd,Ir=ja((Fr="x,y,z,scale,scaleX,scaleY,xPercent,yPercent")+","+(Lr="rotation,rotationX,rotationY,skewX,skewY")+",transform,transformOrigin,svgOrigin,force3D,smoothOrigin,transformPerspective",function(t){ur[t]=1}),ja(Lr,function(t){Y.units[t]="deg",Mr[t]=1}),_r[Ir[13]]=Fr+","+Lr,ja("0:translateX,1:translateY,2:translateZ,8:rotate,8:rotationZ,8:rotateZ,9:rotateX,10:rotateY",function(t){var e=t.split(":");_r[e[1]]=Ir[e[0]]}),ja("x,y,z,top,right,bottom,left,width,height,fontSize,padding,margin,perspective",function(t){Y.units[t]="px"}),Fe.registerPlugin(Br);var Nr=Fe.registerPlugin(Br)||Fe,Ur=Nr.core.Tween;e.Back=rr,e.Bounce=nr,e.CSSPlugin=Br,e.Circ=or,e.Cubic=Qe,e.Elastic=er,e.Expo=sr,e.Linear=He,e.Power0=qe,e.Power1=Xe,e.Power2=Ge,e.Power3=Ze,e.Power4=We,e.Quad=$e,e.Quart=Je,e.Quint=Ke,e.Sine=ar,e.SteppedEase=ir,e.Strong=tr,e.TimelineLite=Gt,e.TimelineMax=Gt,e.TweenLite=te,e.TweenMax=Ur,e.default=Nr,e.gsap=Nr;if (typeof(window)==="undefined"||window!==e){Object.defineProperty(e,"__esModule",{value:!0})} else {delete e.default}});


/*!
 * ScrollTrigger 3.15.1
 * https://gsap.com
 * 
 * @license Copyright 2026, GreenSock. All rights reserved.
 * Subject to the terms at https://gsap.com/standard-license.
 * @author: Jack Doyle, jack@greensock.com
 */

!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e=e||self).window=e.window||{})}(this,function(e){"use strict";function _defineProperties(e,t){for(var r=0;r<t.length;r++){var n=t[r];n.enumerable=n.enumerable||!1,n.configurable=!0,"value"in n&&(n.writable=!0),Object.defineProperty(e,n.key,n)}}function r(){return Se||"undefined"!=typeof window&&(Se=window.gsap)&&Se.registerPlugin&&Se}function z(e,t){return~Le.indexOf(e)&&Le[Le.indexOf(e)+1][t]}function A(e){return!!~t.indexOf(e)}function B(e,t,r,n,i){return e.addEventListener(t,r,{passive:!1!==n,capture:!!i})}function C(e,t,r,n){return e.removeEventListener(t,r,!!n)}function F(){return Re&&Re.isPressed||Ie.cache++}function G(r,n){function fd(e){if(e||0===e){i&&"manual"!==Ce.history.scrollRestoration&&(Ce.history.scrollRestoration="manual");var t=Re&&Re.isPressed;e=fd.v=Math.round(e)||(Re&&Re.iOS?1:0),r(e),fd.cacheID=Ie.cache,t&&o("ss",e)}else(n||Ie.cache!==fd.cacheID||o("ref"))&&(fd.cacheID=Ie.cache,fd.v=r());return fd.v+fd.offset}return fd.offset=0,r&&fd}function J(e,t){return(t&&t._ctx&&t._ctx.selector||Se.utils.toArray)(e)[0]||("string"==typeof e&&!1!==Se.config().nullTargetWarn?console.warn("Element not found:",e):null)}function L(t,e){var r=e.s,n=e.sc;A(t)&&(t=Me.scrollingElement||ke);var i=Ie.indexOf(t),o=n===Xe.sc?1:2;~i||(i=Ie.push(t)-1),Ie[i+o]||B(t,"scroll",F);var a=Ie[i+o],s=a||(Ie[i+o]=G(z(t,r),!0)||(A(t)?n:G(function(e){return arguments.length?t[r]=e:t[r]})));return s.target=t,a||(s.smooth="smooth"===Se.getProperty(t,"scrollBehavior")),s}function M(e,t,i){function Hd(e,t){var r=Ye();t||n<r-s?(a=o,o=e,l=s,s=r):i?o+=e:o=a+(e-a)/(r-l)*(s-l)}var o=e,a=e,s=Ye(),l=s,n=t||50,c=Math.max(500,3*n);return{update:Hd,reset:function reset(){a=o=i?0:o,l=s=0},getVelocity:function getVelocity(e){var t=l,r=a,n=Ye();return!e&&0!==e||e===o||Hd(e),s===l||c<n-l?0:(o+(i?r:-r))/((i?n:s)-t)*1e3}}}function N(e,t){return t&&!e._gsapAllow&&!1!==e.cancelable&&e.preventDefault(),e.changedTouches?e.changedTouches[0]:e}function O(e){var t=Math.max.apply(Math,e),r=Math.min.apply(Math,e);return Math.abs(t)>=Math.abs(r)?t:r}function P(){(Ae=Se.core.globals().ScrollTrigger)&&Ae.core&&function _integrate(){var e=Ae.core,r=e.bridge||{},t=e._scrollers,n=e._proxies;t.push.apply(t,Ie),n.push.apply(n,Le),Ie=t,Le=n,o=function _bridge(e,t){return r[e](t)}}()}function Q(e){return Se=e||r(),!Te&&Se&&"undefined"!=typeof document&&document.body&&(Ce=window,ke=(Me=document).documentElement,Ee=Me.body,t=[Ce,Me,ke,Ee],Se.utils.clamp,Be=Se.core.context||function(){},Oe="onpointerenter"in Ee?"pointer":"mouse",Pe=k.isTouch=Ce.matchMedia&&Ce.matchMedia("(hover: none), (pointer: coarse)").matches?1:"ontouchstart"in Ce||0<navigator.maxTouchPoints||0<navigator.msMaxTouchPoints?2:0,De=k.eventTypes=("ontouchstart"in ke?"touchstart,touchmove,touchcancel,touchend":"onpointerdown"in ke?"pointerdown,pointermove,pointercancel,pointerup":"mousedown,mousemove,mouseup,mouseup").split(","),setTimeout(function(){return i=0},500),Te=1),Ae||P(),Te}var Se,Te,Ce,Me,ke,Ee,Pe,Oe,Ae,t,Re,De,Be,i=1,ze=[],Ie=[],Le=[],Ye=Date.now,o=function _bridge(e,t){return t},n="scrollLeft",a="scrollTop",Ne={s:n,p:"left",p2:"Left",os:"right",os2:"Right",d:"width",d2:"Width",a:"x",sc:G(function(e){return arguments.length?Ce.scrollTo(e,Xe.sc()):Ce.pageXOffset||Me[n]||ke[n]||Ee[n]||0})},Xe={s:a,p:"top",p2:"Top",os:"bottom",os2:"Bottom",d:"height",d2:"Height",a:"y",op:Ne,sc:G(function(e){return arguments.length?Ce.scrollTo(Ne.sc(),e):Ce.pageYOffset||Me[a]||ke[a]||Ee[a]||0})};Ne.op=Xe,Ie.cache=0;var k=(Observer.prototype.init=function init(e){Te||Q(Se)||console.warn("Please gsap.registerPlugin(Observer)"),Ae||P();var i=e.tolerance,a=e.dragMinimum,t=e.type,o=e.target,r=e.lineHeight,n=e.debounce,s=e.preventDefault,l=e.onStop,c=e.onStopDelay,u=e.ignore,f=e.wheelSpeed,d=e.event,p=e.onDragStart,g=e.onDragEnd,h=e.onDrag,v=e.onPress,b=e.onRelease,m=e.onRight,y=e.onLeft,x=e.onUp,_=e.onDown,w=e.onChangeX,S=e.onChangeY,T=e.onChange,k=e.onToggleX,E=e.onToggleY,R=e.onHover,D=e.onHoverEnd,z=e.onMove,I=e.ignoreCheck,Y=e.isNormalizer,X=e.onGestureStart,U=e.onGestureEnd,q=e.onWheel,H=e.onEnable,W=e.onDisable,V=e.onClick,G=e.scrollSpeed,j=e.capture,K=e.allowClicks,$=e.lockAxis,Z=e.onLockAxis;function hf(){return xe=Ye()}function jf(e,t){return(se.event=e)&&u&&function _isWithin(e,t){for(var r=t.length;r--;)if(t[r]===e||t[r].contains(e))return!0;return!1}(e.target,u)||t&&he&&"touch"!==e.pointerType||I&&I(e,t)}function lf(){var e=se.deltaX=O(me),t=se.deltaY=O(ye),r=Math.abs(e)>=i,n=Math.abs(t)>=i;T&&(r||n)&&T(se,e,t,me,ye),r&&(m&&0<se.deltaX&&m(se),y&&se.deltaX<0&&y(se),w&&w(se),k&&se.deltaX<0!=le<0&&k(se),le=se.deltaX,me[0]=me[1]=me[2]=0),n&&(_&&0<se.deltaY&&_(se),x&&se.deltaY<0&&x(se),S&&S(se),E&&se.deltaY<0!=ce<0&&E(se),ce=se.deltaY,ye[0]=ye[1]=ye[2]=0),(ne||re)&&(z&&z(se),re&&(p&&1===re&&p(se),h&&h(se),re=0),ne=!1),oe&&!(oe=!1)&&Z&&Z(se),ie&&(q(se),ie=!1),ee=0}function mf(e,t,r){me[r]+=e,ye[r]+=t,se._vx.update(e),se._vy.update(t),n?ee=ee||requestAnimationFrame(lf):lf()}function nf(e,t){$&&!ae&&(se.axis=ae=Math.abs(e)>Math.abs(t)?"x":"y",oe=!0),"y"!==ae&&(me[2]+=e,se._vx.update(e,!0)),"x"!==ae&&(ye[2]+=t,se._vy.update(t,!0)),n?ee=ee||requestAnimationFrame(lf):lf()}function of(e){if(!jf(e,1)){var t=(e=N(e,s)).clientX,r=e.clientY,n=t-se.x,i=r-se.y,o=se.isDragging;se.x=t,se.y=r,(o||(n||i)&&(Math.abs(se.startX-t)>=a||Math.abs(se.startY-r)>=a))&&(re=re||(o?2:1),o||(se.isDragging=!0),nf(n,i))}}function rf(e){return e.touches&&1<e.touches.length&&(se.isGesturing=!0)&&X(e,se.isDragging)}function sf(){return(se.isGesturing=!1)||U(se)}function tf(e){if(!jf(e)){var t=fe(),r=de();mf((t-pe)*G,(r-ge)*G,1),pe=t,ge=r,l&&te.restart(!0)}}function uf(e){if(!jf(e)){e=N(e,s),q&&(ie=!0);var t=(1===e.deltaMode?r:2===e.deltaMode?Ce.innerHeight:1)*f;mf(e.deltaX*t,e.deltaY*t,0),l&&!Y&&te.restart(!0)}}function vf(e){if(!jf(e)){var t=e.clientX,r=e.clientY,n=t-se.x,i=r-se.y;se.x=t,se.y=r,ne=!0,l&&te.restart(!0),(n||i)&&nf(n,i)}}function wf(e){se.event=e,R(se)}function xf(e){se.event=e,D(se)}function yf(e){return jf(e)||N(e,s)&&V(se)}this.target=o=J(o)||ke,this.vars=e,u=u&&Se.utils.toArray(u),i=i||1e-9,a=a||0,f=f||1,G=G||1,t=t||"wheel,touch,pointer",n=!1!==n,r=r||parseFloat(Ce.getComputedStyle(Ee).lineHeight)||22;var ee,te,re,ne,ie,oe,ae,se=this,le=0,ce=0,ue=e.passive||!s&&!1!==e.passive,fe=L(o,Ne),de=L(o,Xe),pe=fe(),ge=de(),he=~t.indexOf("touch")&&!~t.indexOf("pointer")&&"pointerdown"===De[0],ve=A(o),be=o.ownerDocument||Me,me=[0,0,0],ye=[0,0,0],xe=0,_e=se.onPress=function(e){jf(e,1)||e&&e.button||(se.axis=ae=null,te.pause(),se.isPressed=!0,e=N(e),le=ce=0,se.startX=se.x=e.clientX,se.startY=se.y=e.clientY,se._vx.reset(),se._vy.reset(),B(Y?o:be,De[1],of,ue,!0),se.deltaX=se.deltaY=0,v&&v(se))},we=se.onRelease=function(t){if(!jf(t,1)){C(Y?o:be,De[1],of,!0);var e=!isNaN(se.y-se.startY),r=se.isDragging,n=r&&(3<Math.abs(se.x-se.startX)||3<Math.abs(se.y-se.startY)),i=N(t);!n&&e&&(se._vx.reset(),se._vy.reset(),s&&K&&Se.delayedCall(.08,function(){if(300<Ye()-xe&&!t.defaultPrevented)if(t.target.click)t.target.click();else if(be.createEvent){var e=be.createEvent("MouseEvents");e.initMouseEvent("click",!0,!0,Ce,1,i.screenX,i.screenY,i.clientX,i.clientY,!1,!1,!1,!1,0,null),t.target.dispatchEvent(e)}})),se.isDragging=se.isGesturing=se.isPressed=!1,l&&r&&!Y&&te.restart(!0),re&&lf(),g&&r&&g(se),b&&b(se,n)}};te=se._dc=Se.delayedCall(c||.25,function onStopFunc(){se._vx.reset(),se._vy.reset(),te.pause(),l&&l(se)}).pause(),se.deltaX=se.deltaY=0,se._vx=M(0,50,!0),se._vy=M(0,50,!0),se.scrollX=fe,se.scrollY=de,se.isDragging=se.isGesturing=se.isPressed=!1,Be(this),se.enable=function(e){return se.isEnabled||(B(ve?be:o,"scroll",F),0<=t.indexOf("scroll")&&B(ve?be:o,"scroll",tf,ue,j),0<=t.indexOf("wheel")&&B(o,"wheel",uf,ue,j),(0<=t.indexOf("touch")&&Pe||0<=t.indexOf("pointer"))&&(B(o,De[0],_e,ue,j),B(be,De[2],we),B(be,De[3],we),K&&B(o,"click",hf,!0,!0),V&&B(o,"click",yf),X&&B(be,"gesturestart",rf),U&&B(be,"gestureend",sf),R&&B(o,Oe+"enter",wf),D&&B(o,Oe+"leave",xf),z&&B(o,Oe+"move",vf)),se.isEnabled=!0,se.isDragging=se.isGesturing=se.isPressed=ne=re=!1,se._vx.reset(),se._vy.reset(),pe=fe(),ge=de(),e&&e.type&&_e(e),H&&H(se)),se},se.disable=function(){se.isEnabled&&(ze.filter(function(e){return e!==se&&A(e.target)}).length||C(ve?be:o,"scroll",F),se.isPressed&&(se._vx.reset(),se._vy.reset(),C(Y?o:be,De[1],of,!0)),C(ve?be:o,"scroll",tf,j),C(o,"wheel",uf,j),C(o,De[0],_e,j),C(be,De[2],we),C(be,De[3],we),C(o,"click",hf,!0),C(o,"click",yf),C(be,"gesturestart",rf),C(be,"gestureend",sf),C(o,Oe+"enter",wf),C(o,Oe+"leave",xf),C(o,Oe+"move",vf),se.isEnabled=se.isPressed=se.isDragging=!1,W&&W(se))},se.kill=se.revert=function(){se.disable();var e=ze.indexOf(se);0<=e&&ze.splice(e,1),Re===se&&(Re=0)},ze.push(se),Y&&A(o)&&(Re=se),se.enable(d)},function _createClass(e,t,r){return t&&_defineProperties(e.prototype,t),r&&_defineProperties(e,r),e}(Observer,[{key:"velocityX",get:function get(){return this._vx.getVelocity()}},{key:"velocityY",get:function get(){return this._vy.getVelocity()}}]),Observer);function Observer(e){this.init(e)}k.version="3.15.1",k.create=function(e){return new k(e)},k.register=Q,k.getAll=function(){return ze.slice()},k.getById=function(t){return ze.filter(function(e){return e.vars.id===t})[0]},r()&&Se.registerPlugin(k);function Da(e,t,r){var n=ut(e)&&("clamp("===e.substr(0,6)||-1<e.indexOf("max"));return(r["_"+t+"Clamp"]=n)?e.substr(6,e.length-7):e}function Ea(e,t){return!t||ut(e)&&"clamp("===e.substr(0,6)?e:"clamp("+e+")"}function Ga(){return Ke=1}function Ha(){return Ke=0}function Ia(e){return e}function Ja(e){return Math.round(1e5*e)/1e5||0}function Ka(){return"undefined"!=typeof window}function La(){return Fe||Ka()&&(Fe=window.gsap)&&Fe.registerPlugin&&Fe}function Ma(e){return!!~l.indexOf(e)}function Na(e){return("Height"===e?S:Je["inner"+e])||qe["client"+e]||He["client"+e]}function Oa(e){return z(e,"getBoundingClientRect")||(Ma(e)?function(){return At.width=Je.innerWidth,At.height=S,At}:function(){return wt(e)})}function Ra(e,t){var r=t.s,n=t.d2,i=t.d,o=t.a;return Math.max(0,(r="scroll"+n)&&(o=z(e,r))?o()-Oa(e)()[i]:Ma(e)?(qe[r]||He[r])-Na(n):e[r]-e["offset"+n])}function Sa(e,t){for(var r=0;r<g.length;r+=3)t&&!~t.indexOf(g[r+1])||e(g[r],g[r+1],g[r+2])}function Ua(e){return"function"==typeof e}function Va(e){return"number"==typeof e}function Wa(e){return"object"==typeof e}function Xa(e,t,r){return e&&e.progress(t?0:1)&&r&&e.pause()}function Ya(e,t,r){if(e.enabled){var n=e._ctx?e._ctx.add(function(){return t(e,r)}):t(e,r);n&&n.totalTime&&(e.callbackAnimation=n)}}function nb(e){return Je.getComputedStyle(e.nodeType===Node.DOCUMENT_NODE?e.scrollingElement:e)}function pb(e,t){for(var r in t)r in e||(e[r]=t[r]);return e}function rb(e,t){var r=t.d2;return e["offset"+r]||e["client"+r]||0}function sb(e){var t,r=[],n=e.labels,i=e.duration();for(t in n)r.push(n[t]/i);return r}function ub(i){var o=Fe.utils.snap(i),a=Array.isArray(i)&&i.slice(0).sort(function(e,t){return e-t});return a?function(e,t,r){var n;if(void 0===r&&(r=.001),!t)return o(e);if(0<t){for(e-=r,n=0;n<a.length;n++)if(a[n]>=e)return a[n];return a[n-1]}for(n=a.length,e+=r;n--;)if(a[n]<=e)return a[n];return a[0]}:function(e,t,r){void 0===r&&(r=.001);var n=o(e);return!t||Math.abs(n-e)<r||n-e<0==t<0?n:o(t<0?e-i:e+i)}}function wb(t,r,e,n){return e.split(",").forEach(function(e){return t(r,e,n)})}function xb(e,t,r,n,i){return e.addEventListener(t,r,{passive:!n,capture:!!i})}function yb(e,t,r,n){return e.removeEventListener(t,r,!!n)}function zb(e,t,r){(r=r&&r.wheelHandler)&&(e(t,"wheel",r),e(t,"touchmove",r))}function Db(e,t){if(ut(e)){var r=e.indexOf("="),n=~r?(e.charAt(r-1)+1)*parseFloat(e.substr(r+1)):0;~r&&(e.indexOf("%")>r&&(n*=t/100),e=e.substr(0,r-1)),e=n+(e in X?X[e]*t:~e.indexOf("%")?parseFloat(e)*t/100:parseFloat(e)||0)}return e}function Eb(e,t,r,n,i,o,a,s){var l=i.startColor,c=i.endColor,u=i.fontSize,f=i.indent,d=i.fontWeight,p=Ue.createElement("div"),g=Ma(r)||"fixed"===z(r,"pinType"),h=-1!==e.indexOf("scroller"),v=g?He:"IFRAME"===r.tagName?r.contentDocument.body:r,b=-1!==e.indexOf("start"),m=b?l:c,y="border-color:"+m+";font-size:"+u+";color:"+m+";font-weight:"+d+";pointer-events:none;white-space:nowrap;font-family:sans-serif,Arial;z-index:1000;padding:4px 8px;border-width:0;border-style:solid;";return y+="position:"+((h||s)&&g?"fixed;":"absolute;"),!h&&!s&&g||(y+=(n===Xe?D:I)+":"+(o+parseFloat(f))+"px;"),a&&(y+="box-sizing:border-box;text-align:left;width:"+a.offsetWidth+"px;"),p._isStart=b,p.setAttribute("class","gsap-marker-"+e+(t?" marker-"+t:"")),p.style.cssText=y,p.innerText=t||0===t?e+"-"+t:e,v.children[0]?v.insertBefore(p,v.children[0]):v.appendChild(p),p._offset=p["offset"+n.op.d2],U(p,0,n,b),p}function Jb(){return 34<st()-lt&&(T=T||requestAnimationFrame(K))}function Kb(){v&&v.isPressed&&!(v.startX>He.clientWidth)||(Ie.cache++,v?T=T||requestAnimationFrame(K):K(),lt||W("scrollStart"),lt=st())}function Lb(){y=Je.innerWidth,m=Je.innerHeight}function Mb(e){Ie.cache++,!0!==e&&(je||h||Ue.fullscreenElement||Ue.webkitFullscreenElement||b&&y===Je.innerWidth&&!(Math.abs(Je.innerHeight-m)>.25*Je.innerHeight))||c.restart(!0)}function Pb(){return yb(re,"scrollEnd",Pb)||Et(!0)}function Sb(e){for(var t=0;t<V.length;t+=5)(!e||V[t+4]&&V[t+4].query===e)&&(V[t].style.cssText=V[t+1],V[t].getBBox&&V[t].setAttribute("transform",V[t+2]||""),V[t+3].uncache=1)}function Tb(){Ie.cache++,Ie.forEach(function(e){return Ua(e)&&(e.rec=e())})}function Ub(e,t){var r;for($e=0;$e<Ct.length;$e++)!(r=Ct[$e])||t&&r._ctx!==t||(e?r.kill(1):r.revert(!0,!0));et=!0,t&&Sb(t),t||W("revert")}function Vb(e,t){Ie.cache++,!t&&nt||Ie.forEach(function(e){return Ua(e)&&e.cacheID++&&(e.rec=0)}),ut(e)&&(_=e,Je.history.scrollRestoration!==e&&(Je.history.scrollRestoration=e))}function $b(){He.appendChild(w),S=!v&&w.offsetHeight||Je.innerHeight,He.removeChild(w)}function _b(t){return We(".gsap-marker-start, .gsap-marker-end, .gsap-marker-scroller-start, .gsap-marker-scroller-end").forEach(function(e){return e.style.display=t?"none":"block"})}function ic(e,t,r,n){if(!e._gsap.swappedIn){for(var i,o=$.length,a=t.style,s=e.style;o--;)a[i=$[o]]=r[i];a.position="absolute"===r.position?"absolute":"relative","inline"===r.display&&(a.display="inline-block"),s[I]=s[D]="auto",a.flexBasis=r.flexBasis||"auto",a.overflow="visible",a.boxSizing="border-box",a[dt]=rb(e,Ne)+_t,a[pt]=rb(e,Xe)+_t,a[mt]=s[yt]=s.top=s.left="0",Ot(n),s[dt]=s.maxWidth=r[dt],s[pt]=s.maxHeight=r[pt],s[mt]=r[mt],e.parentNode!==t&&(e.parentNode.insertBefore(t,e),t.appendChild(e)),e._gsap.swappedIn=!0}}function lc(e){for(var t=Z.length,r=e.style,n=[],i=0;i<t;i++)n.push(Z[i],r[Z[i]]);return n.t=e,n}function oc(e,t,r,n,i,o,a,s,l,c,u,f,d,p){Ua(e)&&(e=e(s)),ut(e)&&"max"===e.substr(0,3)&&(e=f+("="===e.charAt(4)?Db("0"+e.substr(3),r):0));var g,h,v,b=d?d.time():0;if(d&&d.seek(0),isNaN(e)||(e=+e),Va(e))d&&(e=Fe.utils.mapRange(d.scrollTrigger.start,d.scrollTrigger.end,0,f,e)),a&&U(a,r,n,!0);else{Ua(t)&&(t=t(s));var m,y,x,_,w=(e||"0").split(" ");v=J(t,s)||He,(m=wt(v)||{})&&(m.left||m.top)||"none"!==nb(v).display||(_=v.style.display,v.style.display="block",m=wt(v),_?v.style.display=_:v.style.removeProperty("display")),y=Db(w[0],m[n.d]),x=Db(w[1]||"0",r),e=m[n.p]-l[n.p]-c+y+i-x,a&&U(a,x,n,r-x<20||a._isStart&&20<x),r-=r-x}if(p&&(s[p]=e||-.001,e<0&&(e=0)),o){var S=e+r,T=o._isStart;g="scroll"+n.d2,U(o,S,n,T&&20<S||!T&&(u?Math.max(He[g],qe[g]):o.parentNode[g])<=S+1),u&&(l=wt(a),u&&(o.style[n.op.p]=l[n.op.p]-n.op.m-o._offset+_t))}return d&&v&&(g=wt(v),d.seek(f),h=wt(v),d._caScrollDist=g[n.p]-h[n.p],e=e/d._caScrollDist*f),d&&d.seek(b),d?e:Math.round(e)}function qc(e,t,r,n){if(e.parentNode!==t){var i,o,a=e.style;if(t===He){for(i in e._stOrig=a.cssText,o=nb(e))+i||te.test(i)||!o[i]||"string"!=typeof a[i]||"0"===i||(a[i]=o[i]);a.top=r,a.left=n}else a.cssText=e._stOrig;Fe.core.getCache(e).uncache=1,t.appendChild(e)}}function rc(r,e,n){var i=e,o=i;return function(e){var t=Math.round(r());return t!==i&&t!==o&&3<Math.abs(t-i)&&3<Math.abs(t-o)&&(e=t,n&&n()),o=i,i=Math.round(e)}}function sc(e,t,r){var n={};n[t.p]="+="+r,Fe.set(e,n)}function tc(c,e){function Jk(e,t,r,n,i){var o=Jk.tween,a=t.onComplete,s={};r=r||u();var l=rc(u,r,function(){o.kill(),Jk.tween=0});return i=n&&i||0,n=n||e-r,o&&o.kill(),t[f]=e,t.inherit=!1,(t.modifiers=s)[f]=function(){return l(r+n*o.ratio+i*o.ratio*o.ratio)},t.onUpdate=function(){Ie.cache++,Jk.tween&&K()},t.onComplete=function(){Jk.tween=0,a&&a.call(o)},o=Jk.tween=Fe.to(c,t)}var u=L(c,e),f="_scroll"+e.p2;return(c[f]=u).wheelHandler=function(){return Jk.tween&&Jk.tween.kill()&&(Jk.tween=0)},xb(c,"wheel",u.wheelHandler),re.isTouch&&xb(c,"touchmove",u.wheelHandler),Jk}var Fe,s,Je,Ue,qe,He,l,c,We,Ve,Ge,u,je,Ke,f,$e,d,p,g,Qe,Ze,h,v,b,m,y,E,x,_,w,S,et,tt,rt,T,nt,it,ot,at=1,st=Date.now,R=st(),lt=0,ct=0,ut=function _isString(e){return"string"==typeof e},ft=Math.abs,D="right",I="bottom",dt="width",pt="height",gt="Right",ht="Left",vt="Top",bt="Bottom",mt="padding",yt="margin",xt="Width",Y="Height",_t="px",wt=function _getBounds(e,t){var r=t&&"matrix(1, 0, 0, 1, 0, 0)"!==nb(e)[f]&&Fe.to(e,{x:0,y:0,xPercent:0,yPercent:0,rotation:0,rotationX:0,rotationY:0,scale:1,skewX:0,skewY:0}).progress(1),n=e.getBoundingClientRect?e.getBoundingClientRect():e.scrollingElement.getBoundingClientRect();return r&&r.progress(0).kill(),n},St={startColor:"green",endColor:"red",indent:0,fontSize:"16px",fontWeight:"normal"},Tt={toggleActions:"play",anticipatePin:0},X={top:0,left:0,center:.5,bottom:1,right:1},U=function _positionMarker(e,t,r,n){var i={display:"block"},o=r[n?"os2":"p2"],a=r[n?"p2":"os2"];e._isFlipped=n,i[r.a+"Percent"]=n?-100:0,i[r.a]=n?"1px":0,i["border"+o+xt]=1,i["border"+a+xt]=0,i[r.p]=t+"px",Fe.set(e,i)},Ct=[],Mt={},q={},H=[],W=function _dispatch(e){return q[e]&&q[e].map(function(e){return e()})||H},V=[],kt=0,Et=function _refreshAll(e,t){if(qe=Ue.documentElement,He=Ue.body,l=[Je,Ue,qe,He],!lt||e||et){$b(),nt=re.isRefreshing=!0,et||Tb();var r=W("refreshInit");Qe&&re.sort(),t||Ub(),Ie.forEach(function(e){Ua(e)&&(e.smooth&&(e.target.style.scrollBehavior="auto"),e(0))}),Ct.slice(0).forEach(function(e){return e.refresh()}),et=!1,Ct.forEach(function(e){if(e._subPinOffset&&e.pin){var t=e.vars.horizontal?"offsetWidth":"offsetHeight",r=e.pin[t];e.revert(!0,1),e.adjustPinSpacing(e.pin[t]-r),e.refresh()}}),tt=1,_b(!0),Ct.forEach(function(e){var t=Ra(e.scroller,e._dir),r="max"===e.vars.end||e._endClamp&&e.end>t,n=e._startClamp&&e.start>=t;(r||n)&&e.setPositions(n?t-1:e.start,r?Math.max(n?t:e.start+1,t):e.end,!0)}),_b(!1),tt=0,r.forEach(function(e){return e&&e.render&&e.render(-1)}),Ie.forEach(function(e){Ua(e)&&(e.smooth&&requestAnimationFrame(function(){return e.target.style.scrollBehavior="smooth"}),e.rec&&e(e.rec))}),Vb(_,1),c.pause(),kt++,K(nt=2),Ct.forEach(function(e){return Ua(e.vars.onRefresh)&&e.vars.onRefresh(e)}),nt=re.isRefreshing=!1,W("refresh")}else xb(re,"scrollEnd",Pb)},j=0,Pt=1,K=function _updateAll(e){if(2===e||!nt&&!et){re.isUpdating=!0,ot&&ot.update(0);var t=Ct.length,r=st(),n=50<=r-R,i=t&&Ct[0].scroll();if(Pt=i<j?-1:1,nt||(j=i),n&&(lt&&!Ke&&200<r-lt&&(lt=0,W("scrollEnd")),Ge=R,R=r),Pt<0){for($e=t;0<$e--;)Ct[$e]&&Ct[$e].update(0,n);Pt=1}else for($e=0;$e<t;$e++)Ct[$e]&&Ct[$e].update(0,n);re.isUpdating=!1}T=0},$=["left","top",I,D,yt+bt,yt+gt,yt+vt,yt+ht,"display","flexShrink","float","zIndex","gridColumnStart","gridColumnEnd","gridRowStart","gridRowEnd","gridArea","justifySelf","alignSelf","placeSelf","order"],Z=$.concat([dt,pt,"boxSizing","max"+xt,"max"+Y,"position",yt,mt,mt+vt,mt+gt,mt+bt,mt+ht]),ee=/([A-Z])/g,Ot=function _setState(e){if(e){var t,r,n=e.t.style,i=e.length,o=0;for((e.t._gsap||Fe.core.getCache(e.t)).uncache=1;o<i;o+=2)r=e[o+1],t=e[o],r?n[t]=r:n[t]&&n.removeProperty(t.replace(ee,"-$1").toLowerCase())}},At={left:0,top:0},te=/(webkit|moz|length|cssText|inset)/i,re=(ScrollTrigger.prototype.init=function init(P,O){if(this.progress=this.start=0,this.vars&&this.kill(!0,!0),ct){var A,n,p,R,D,B,I,Y,N,X,F,e,U,q,H,W,V,G,t,j,b,K,$,m,Q,y,Z,x,r,_,w,ee,i,g,te,re,ne,S,o,T=(P=pb(ut(P)||Va(P)||P.nodeType?{trigger:P}:P,Tt)).onUpdate,C=P.toggleClass,a=P.id,M=P.onToggle,ie=P.onRefresh,k=P.scrub,oe=P.trigger,ae=P.pin,se=P.pinSpacing,le=P.invalidateOnRefresh,E=P.anticipatePin,s=P.onScrubComplete,h=P.onSnapComplete,ce=P.once,ue=P.snap,fe=P.pinReparent,l=P.pinSpacer,de=P.containerAnimation,pe=P.fastScrollEnd,ge=P.preventOverlaps,he=P.horizontal||P.containerAnimation&&!1!==P.horizontal?Ne:Xe,ve=!k&&0!==k,be=J(P.scroller||Je),c=Fe.core.getCache(be),me=Ma(be),ye="fixed"===("pinType"in P?P.pinType:z(be,"pinType")||me&&"fixed"),xe=[P.onEnter,P.onLeave,P.onEnterBack,P.onLeaveBack],_e=ve&&P.toggleActions.split(" "),we="markers"in P?P.markers:Tt.markers,Se=me?0:parseFloat(nb(be)["border"+he.p2+xt])||0,Te=this,Ce=P.onRefreshInit&&function(){return P.onRefreshInit(Te)},Me=function _getSizeFunc(e,t,r){var n=r.d,i=r.d2,o=r.a;return(o=z(e,"getBoundingClientRect"))?function(){return o()[n]}:function(){return(t?Na(i):e["client"+i])||0}}(be,me,he),ke=function _getOffsetsFunc(e,t){return!t||~Le.indexOf(e)?Oa(e):function(){return At}}(be,me),Ee=0,Pe=0,Oe=0,Ae=L(be,he);if(Te._startClamp=Te._endClamp=!1,Te._dir=he,E*=45,Te.scroller=be,Te.scroll=de?de.time.bind(de):Ae,R=Ae(),et&&null==Ae.rec&&(Ae.rec=R),Te.vars=P,O=O||P.animation,"refreshPriority"in P&&(Qe=1,-9999===P.refreshPriority&&(ot=Te)),c.tweenScroll=c.tweenScroll||{top:tc(be,Xe),left:tc(be,Ne)},Te.tweenTo=A=c.tweenScroll[he.p],Te.scrubDuration=function(e){(i=Va(e)&&e)?ee?ee.duration(e):ee=Fe.to(O,{ease:"expo",totalProgress:"+=0",inherit:!1,duration:i,paused:!0,onComplete:function onComplete(){return s&&s(Te)}}):(ee&&ee.progress(1).kill(),ee=0)},O&&(O.vars.lazy=!1,O._initted&&!Te.isReverted||!1!==O.vars.immediateRender&&!1!==P.immediateRender&&O.duration()&&O.render(0,!0,!0),Te.animation=O.pause(),(O.scrollTrigger=Te).scrubDuration(k),_=0,a=a||O.vars.id),ue&&(Wa(ue)&&!ue.push||(ue={snapTo:ue}),"scrollBehavior"in He.style&&Fe.set(me?[He,qe]:be,{scrollBehavior:"auto"}),Ie.forEach(function(e){return Ua(e)&&e.target===(me?Ue.scrollingElement||qe:be)&&(e.smooth=!1)}),p=Ua(ue.snapTo)?ue.snapTo:"labels"===ue.snapTo?function _getClosestLabel(t){return function(e){return Fe.utils.snap(sb(t),e)}}(O):"labelsDirectional"===ue.snapTo?function _getLabelAtDirection(r){return function(e,t){return ub(sb(r))(e,t.direction)}}(O):!1!==ue.directional?function(e,t){return ub(ue.snapTo)(e,st()-Pe<500?0:t.direction)}:Fe.utils.snap(ue.snapTo),g=ue.duration||{min:.1,max:2},g=Wa(g)?Ve(g.min,g.max):Ve(g,g),te=Fe.delayedCall(ue.delay||i/2||.1,function(){var e=Ae(),t=st()-Pe<500,r=A.tween;if(!(t||Math.abs(Te.getVelocity())<10)||r||Ke||Ee===e)Te.isActive&&Ee!==e&&te.restart(!0);else{var n,i,o=(e-B)/q,a=O&&!ve?O.totalProgress():o,s=t?0:(a-w)/(st()-Ge)*1e3||0,l=Fe.utils.clamp(-o,1-o,ft(s/2)*s/.185),c=o+(!1===ue.inertia?0:l),u=ue.onStart,f=ue.onInterrupt,d=ue.onComplete;if(n=p(c,Te),Va(n)||(n=c),i=Math.max(0,Math.round(B+n*q)),e<=I&&B<=e&&i!==e){if(r&&!r._initted&&r.data<=ft(i-e))return;!1===ue.inertia&&(l=n-o),A(i,{duration:g(ft(.185*Math.max(ft(c-a),ft(n-a))/s/.05||0)),ease:ue.ease||"power3",data:ft(i-e),onInterrupt:function onInterrupt(){return te.restart(!0)&&f&&Ya(Te,f)},onComplete:function onComplete(){Te.update(),Ee=Ae(),O&&!ve&&(ee?ee.resetTo("totalProgress",n,O._tTime/O._tDur):O.progress(n)),_=w=O&&!ve?O.totalProgress():Te.progress,h&&h(Te),d&&Ya(Te,d)}},e,l*q,i-e-l*q),u&&Ya(Te,u,A.tween)}}}).pause()),a&&(Mt[a]=Te),o=(o=(oe=Te.trigger=J(oe||!0!==ae&&ae))&&oe._gsap&&oe._gsap.stRevert)&&o(Te),ae=!0===ae?oe:J(ae),ut(C)&&(C={targets:oe,className:C}),ae&&(!1===se||se===yt||(se=!(!se&&ae.parentNode&&ae.parentNode.style&&"flex"===nb(ae.parentNode).display)&&mt),Te.pin=ae,(n=Fe.core.getCache(ae)).spacer?H=n.pinState:(l&&((l=J(l))&&!l.nodeType&&(l=l.current||l.nativeElement),n.spacerIsNative=!!l,l&&(n.spacerState=lc(l))),n.spacer=G=l||Ue.createElement("div"),G.classList.add("pin-spacer"),a&&G.classList.add("pin-spacer-"+a),n.pinState=H=lc(ae)),!1!==P.force3D&&Fe.set(ae,{force3D:!0}),Te.spacer=G=n.spacer,r=nb(ae),m=r[se+he.os2],j=Fe.getProperty(ae),b=Fe.quickSetter(ae,he.a,_t),ic(ae,G,r),V=lc(ae)),we){e=Wa(we)?pb(we,St):St,X=Eb("scroller-start",a,be,he,e,0),F=Eb("scroller-end",a,be,he,e,0,X),t=X["offset"+he.op.d2];var u=J(z(be,"content")||be);Y=this.markerStart=Eb("start",a,u,he,e,t,0,de),N=this.markerEnd=Eb("end",a,u,he,e,t,0,de),de&&(S=Fe.quickSetter([Y,N],he.a,_t)),ye||Le.length&&!0===z(be,"fixedMarkers")||(function _makePositionable(e){var t=nb(e).position;e.style.position="absolute"===t||"fixed"===t?t:"relative"}(me?He:be),Fe.set([X,F],{force3D:!0}),y=Fe.quickSetter(X,he.a,_t),x=Fe.quickSetter(F,he.a,_t))}if(de){var f=de.vars.onUpdate,d=de.vars.onUpdateParams;de.eventCallback("onUpdate",function(){Te.update(0,0,1),f&&f.apply(de,d||[])})}if(Te.previous=function(){return Ct[Ct.indexOf(Te)-1]},Te.next=function(){return Ct[Ct.indexOf(Te)+1]},Te.revert=function(e,t){if(!t)return Te.kill(!0);var r=!1!==e||!Te.enabled,n=je;r!==Te.isReverted&&(r&&(re=Math.max(Ae(),Te.scroll.rec||0),Oe=Te.progress,ne=O&&O.progress()),Y&&[Y,N,X,F].forEach(function(e){return e.style.display=r?"none":"block"}),r&&(je=Te).update(r),!ae||fe&&Te.isActive||(r?function _swapPinOut(e,t,r){Ot(r);var n=e._gsap;if(n.spacerIsNative)Ot(n.spacerState);else if(e._gsap.swappedIn){var i=t.parentNode;i&&(i.insertBefore(e,t),i.removeChild(t))}e._gsap.swappedIn=!1}(ae,G,H):ic(ae,G,nb(ae),Q)),r||Te.update(r),je=n,Te.isReverted=r)},Te.refresh=function(e,t,r,n){if(!je&&Te.enabled||t)if(ae&&e&&lt)xb(ScrollTrigger,"scrollEnd",Pb);else{!nt&&Ce&&Ce(Te),je=Te,A.tween&&!r&&(A.tween.kill(),A.tween=0),ee&&ee.pause(),le&&O&&(O.revert({kill:!1}).invalidate(),O.getChildren?O.getChildren(!0,!0,!1).forEach(function(e){return e.vars.immediateRender&&e.render(0,!0,!0)}):O.vars.immediateRender&&O.render(0,!0,!0)),Te.isReverted||Te.revert(!0,!0),Te._subPinOffset=!1;var i,o,a,s,l,c,u,f,d,p,g,h,v,b=Me(),m=ke(),y=de?de.duration():Ra(be,he),x=q<=.01||!q,_=0,w=n||0,S=Wa(r)?r.end:P.end,T=P.endTrigger||oe,C=Wa(r)?r.start:P.start||(0!==P.start&&oe?ae?"0 0":"0 100%":0),M=Te.pinnedContainer=P.pinnedContainer&&J(P.pinnedContainer,Te),k=oe&&Math.max(0,Ct.indexOf(Te))||0,E=k;for(we&&Wa(r)&&(h=Fe.getProperty(X,he.p),v=Fe.getProperty(F,he.p));0<E--;)(c=Ct[E]).end||c.refresh(0,1)||(je=Te),!(u=c.pin)||u!==oe&&u!==ae&&u!==M||c.isReverted||((p=p||[]).unshift(c),c.revert(!0,!0)),c!==Ct[E]&&(k--,E--);for(Ua(C)&&(C=C(Te)),C=Da(C,"start",Te),B=oc(C,oe,b,he,Ae(),Y,X,Te,m,Se,ye,y,de,Te._startClamp&&"_startClamp")||(ae?-.001:0),Ua(S)&&(S=S(Te)),ut(S)&&!S.indexOf("+=")&&(~S.indexOf(" ")?S=(ut(C)?C.split(" ")[0]:"")+S:(_=Db(S.substr(2),b),S=ut(C)?C:(de?Fe.utils.mapRange(0,de.duration(),de.scrollTrigger.start,de.scrollTrigger.end,B):B)+_,T=oe)),S=Da(S,"end",Te),I=Math.max(B,oc(S||(T?"100% 0":y),T,b,he,Ae()+_,N,F,Te,m,Se,ye,y,de,Te._endClamp&&"_endClamp"))||-.001,_=0,E=k;E--;)(u=(c=Ct[E]||{}).pin)&&c.start-c._pinPush<=B&&!de&&0<c.end&&(i=c.end-(Te._startClamp?Math.max(0,c.start):c.start),(u===oe&&c.start-c._pinPush<B||u===M)&&isNaN(C)&&(_+=i*(1-c.progress)),u===ae&&(w+=i));if(B+=_,I+=_,Te._startClamp&&(Te._startClamp+=_),Te._endClamp&&!nt&&(Te._endClamp=I||-.001,I=Math.min(I,Ra(be,he))),q=I-B||(B-=.01)&&.001,x&&(Oe=Fe.utils.clamp(0,1,Fe.utils.normalize(B,I,re))),Te._pinPush=w,Y&&_&&((i={})[he.a]="+="+_,M&&(i[he.p]="-="+Ae()),Fe.set([Y,N],i)),!ae||tt&&Te.end>=Ra(be,he)){if(oe&&Ae()&&!de)for(o=oe.parentNode;o&&o!==He;)o._pinOffset&&(B-=o._pinOffset,I-=o._pinOffset),o=o.parentNode}else i=nb(ae),s=he===Xe,a=Ae(),K=parseFloat(j(he.a))+w,!y&&1<I&&(g={style:g=(me?Ue.scrollingElement||qe:be).style,value:g["overflow"+he.a.toUpperCase()]},me&&"scroll"!==nb(He)["overflow"+he.a.toUpperCase()]&&(g.style["overflow"+he.a.toUpperCase()]="scroll")),ic(ae,G,i),V=lc(ae),o=wt(ae,!0),f=ye&&L(be,s?Ne:Xe)(),se?((Q=[se+he.os2,q+w+_t]).t=G,(E=se===mt?rb(ae,he)+q+w:0)&&(Q.push(he.d,E+_t),"auto"!==G.style.flexBasis&&(G.style.flexBasis=E+_t)),Ot(Q),M&&Ct.forEach(function(e){e.pin===M&&!1!==e.vars.pinSpacing&&(e._subPinOffset=!0)}),ye&&Ae(re)):(E=rb(ae,he))&&"auto"!==G.style.flexBasis&&(G.style.flexBasis=E+_t),ye&&((l={top:o.top+(s?a-B:f)+_t,left:o.left+(s?f:a-B)+_t,boxSizing:"border-box",position:"fixed"})[dt]=l.maxWidth=Math.ceil(o.width)+_t,l[pt]=l.maxHeight=Math.ceil(o.height)+_t,l[yt]=l[yt+vt]=l[yt+gt]=l[yt+bt]=l[yt+ht]="0",l[mt]=i[mt],l[mt+vt]=i[mt+vt],l[mt+gt]=i[mt+gt],l[mt+bt]=i[mt+bt],l[mt+ht]=i[mt+ht],W=function _copyState(e,t,r){for(var n,i=[],o=e.length,a=r?8:0;a<o;a+=2)n=e[a],i.push(n,n in t?t[n]:e[a+1]);return i.t=e.t,i}(H,l,fe),nt&&Ae(0)),O?(d=O._initted,Ze(1),O.render(O.duration(),!0,!0),$=j(he.a)-K+q+w,Z=1<Math.abs(q-$),ye&&Z&&W.splice(W.length-2,2),O.render(0,!0,!0),d||O.invalidate(!0),O.parent||O.totalTime(O.totalTime()),Ze(0)):$=q,g&&(g.value?g.style["overflow"+he.a.toUpperCase()]=g.value:g.style.removeProperty("overflow-"+he.a));p&&p.forEach(function(e){return e.revert(!1,!0)}),Te.start=B,Te.end=I,R=D=nt?re:Ae(),de||nt||et||(R<re&&Ae(re),Te.scroll.rec=0),Te.revert(!1,!0),Pe=st(),te&&(Ee=-1,te.restart(!0)),je=0,O&&ve&&(O._initted||ne)&&O.progress()!==ne&&O.progress(ne||0,!0).render(O.time(),!0,!0),(x||Oe!==Te.progress||de||le||O&&!O._initted)&&(O&&!ve&&(O._initted||Oe||!1!==O.vars.immediateRender)&&O.totalProgress(de&&B<-.001&&!Oe?Fe.utils.normalize(B,I,0):Oe,!0),Te.progress=x||(R-B)/q===Oe?0:Oe),ae&&se&&(G._pinOffset=Math.round(Te.progress*$)),ee&&ee.invalidate(),isNaN(h)||(h-=Fe.getProperty(X,he.p),v-=Fe.getProperty(F,he.p),sc(X,he,h),sc(Y,he,h-(n||0)),sc(F,he,v),sc(N,he,v-(n||0))),x&&!nt&&Te.update(),!ie||nt||U||(U=!0,ie(Te),U=!1)}},Te.getVelocity=function(){return(Ae()-D)/(st()-Ge)*1e3||0},Te.endAnimation=function(){Xa(Te.callbackAnimation),O&&(ee?ee.progress(1):O.paused()?ve||Xa(O,Te.direction<0,1):Xa(O,O.reversed()))},Te.labelToScroll=function(e){return O&&O.labels&&(B||Te.refresh()||B)+O.labels[e]/O.duration()*q||0},Te.getTrailing=function(t){var e=Ct.indexOf(Te),r=0<Te.direction?Ct.slice(0,e).reverse():Ct.slice(e+1);return(ut(t)?r.filter(function(e){return e.vars.preventOverlaps===t}):r).filter(function(e){return 0<Te.direction?e.end<=B:e.start>=I})},Te.update=function(e,t,r){if(!de||r||e){var n,i,o,a,s,l,c,u=!0===nt?re:Te.scroll(),f=e?0:(u-B)/q,d=f<0?0:1<f?1:f||0,p=Te.progress;if(t&&(D=R,R=de?Ae():u,ue&&(w=_,_=O&&!ve?O.totalProgress():d)),E&&ae&&!je&&!at&&lt&&(!d&&B<u+(u-D)/(st()-Ge)*E?d=1e-4:1===d&&I>u+(u-D)/(st()-Ge)*E&&(d=.9999)),d!==p&&Te.enabled){if(a=(s=(n=Te.isActive=!!d&&d<1)!=(!!p&&p<1))||!!d!=!!p,Te.direction=p<d?1:-1,Te.progress=d,a&&!je&&(i=d&&!p?0:1===d?1:1===p?2:3,ve&&(o=!s&&"none"!==_e[i+1]&&_e[i+1]||_e[i],c=O&&("complete"===o||"reset"===o||o in O))),ge&&(s||c)&&(c||k||!O)&&(Ua(ge)?ge(Te):Te.getTrailing(ge).forEach(function(e){return e.endAnimation()})),ve||(!ee||je||at?O&&O.totalProgress(d,!(!je||!Pe&&!e)):(ee._dp._time-ee._start!==ee._time&&ee.render(ee._dp._time-ee._start),ee.resetTo?ee.resetTo("totalProgress",d,O._tTime/O._tDur):(ee.vars.totalProgress=d,ee.invalidate().restart()))),ae)if(e&&se&&(G.style[se+he.os2]=m),ye){if(a){if(l=!e&&p<d&&u<I+1&&u+1>=Ra(be,he),fe)if(e||!n&&!l)qc(ae,G);else{var g=wt(ae,!0),h=u-B;qc(ae,He,g.top+(he===Xe?h:0)+_t,g.left+(he===Xe?0:h)+_t)}Ot(n||l?W:V),Z&&d<1&&n||b(K+(1!==d||l?0:$))}}else b(Ja(K+$*d));!ue||A.tween||je||at||te.restart(!0),C&&(s||ce&&d&&(d<1||!rt))&&We(C.targets).forEach(function(e){return e.classList[n||ce?"add":"remove"](C.className)}),!T||ve||e||T(Te),a&&!je?(ve&&(c&&("complete"===o?O.pause().totalProgress(1):"reset"===o?O.restart(!0).pause():"restart"===o?O.restart(!0):O[o]()),T&&T(Te)),!s&&rt||(M&&s&&Ya(Te,M),xe[i]&&Ya(Te,xe[i]),ce&&(1===d?Te.kill(!1,1):xe[i]=0),s||xe[i=1===d?1:3]&&Ya(Te,xe[i])),pe&&!n&&Math.abs(Te.getVelocity())>(Va(pe)?pe:2500)&&(Xa(Te.callbackAnimation),ee?ee.progress(1):Xa(O,"reverse"===o?1:!d,1))):ve&&T&&!je&&T(Te)}if(x){var v=de?u/de.duration()*(de._caScrollDist||0):u;y(v+(X._isFlipped?1:0)),x(v)}S&&S(-u/de.duration()*(de._caScrollDist||0))}},Te.enable=function(e,t){Te.enabled||(Te.enabled=!0,xb(be,"resize",Mb),me||xb(be,"scroll",Kb),Ce&&xb(ScrollTrigger,"refreshInit",Ce),!1!==e&&(Te.progress=Oe=0,R=D=Ee=Ae()),!1!==t&&Te.refresh())},Te.getTween=function(e){return e&&A?A.tween:ee},Te.setPositions=function(e,t,r,n){if(de){var i=de.scrollTrigger,o=de.duration(),a=i.end-i.start;e=i.start+a*e/o,t=i.start+a*t/o}Te.refresh(!1,!1,{start:Ea(e,r&&!!Te._startClamp),end:Ea(t,r&&!!Te._endClamp)},n),Te.update()},Te.adjustPinSpacing=function(e){if(Q&&e){var t=Q.indexOf(he.d)+1;Q[t]=parseFloat(Q[t])+e+_t,Q[1]=parseFloat(Q[1])+e+_t,Ot(Q)}},Te.disable=function(e,t){if(!1!==e&&Te.revert(!0,!0),Te.enabled&&(Te.enabled=Te.isActive=!1,t||ee&&ee.pause(),re=0,n&&(n.uncache=1),Ce&&yb(ScrollTrigger,"refreshInit",Ce),te&&(te.pause(),A.tween&&A.tween.kill()&&(A.tween=0)),!me)){for(var r=Ct.length;r--;)if(Ct[r].scroller===be&&Ct[r]!==Te)return;yb(be,"resize",Mb),me||yb(be,"scroll",Kb)}},Te.kill=function(e,t){Te.disable(e,t),ee&&!t&&ee.kill(),a&&delete Mt[a];var r=Ct.indexOf(Te);0<=r&&Ct.splice(r,1),r===$e&&0<Pt&&$e--,r=0,Ct.forEach(function(e){return e.scroller===Te.scroller&&(r=1)}),r||nt||et||(Te.scroll.rec=0),O&&(O.scrollTrigger=null,e&&O.revert({kill:!1}),t||O.kill()),Y&&[Y,N,X,F].forEach(function(e){return e.parentNode&&e.parentNode.removeChild(e)}),ot===Te&&(ot=0),ae&&(n&&(n.uncache=1),r=0,Ct.forEach(function(e){return e.pin===ae&&r++}),r||(n.spacer=0)),P.onKill&&P.onKill(Te)},Ct.push(Te),Te.enable(!1,!1),o&&o(Te),O&&O.add&&!q){var v=Te.update;Te.update=function(){Te.update=v,Ie.cache++,B||I||Te.refresh()},Fe.delayedCall(.01,Te.update),q=.01,B=I=0}else Te.refresh();ae&&function _queueRefreshAll(){if(it!==kt){var e=it=kt;requestAnimationFrame(function(){return e===kt&&Et(!0)})}}()}else this.update=this.refresh=this.kill=Ia},ScrollTrigger.register=function register(e){return s||(Fe=e||La(),Ka()&&window.document&&ScrollTrigger.enable(),s=ct),s},ScrollTrigger.defaults=function defaults(e){if(e)for(var t in e)Tt[t]=e[t];return Tt},ScrollTrigger.disable=function disable(t,r){ct=0,Ct.forEach(function(e){return e[r?"kill":"disable"](t)}),yb(Je,"wheel",Kb),yb(Ue,"scroll",Kb),clearInterval(u),yb(Ue,"touchcancel",Ia),yb(He,"touchstart",Ia),wb(yb,Ue,"pointerdown,touchstart,mousedown",Ga),wb(yb,Ue,"pointerup,touchend,mouseup",Ha),c.kill(),Sa(yb);for(var e=0;e<Ie.length;e+=3)zb(yb,Ie[e],Ie[e+1]),zb(yb,Ie[e],Ie[e+2])},ScrollTrigger.enable=function enable(){if(Je=window,Ue=document,qe=Ue.documentElement,He=Ue.body,Fe)if(We=Fe.utils.toArray,Ve=Fe.utils.clamp,x=Fe.core.context||Ia,Ze=Fe.core.suppressOverwrites||Ia,_=Je.history.scrollRestoration||"auto",j=Je.pageYOffset||0,Fe.core.globals("ScrollTrigger",ScrollTrigger),He){ct=1,(w=document.createElement("div")).style.height="100vh",w.style.position="absolute",$b(),function _rafBugFix(){return ct&&requestAnimationFrame(_rafBugFix)}(),k.register(Fe),ScrollTrigger.isTouch=k.isTouch,E=k.isTouch&&/(iPad|iPhone|iPod|Mac)/g.test(navigator.userAgent),b=1===k.isTouch,xb(Je,"wheel",Kb),l=[Je,Ue,qe,He],Fe.matchMedia?(ScrollTrigger.matchMedia=function(e){var t,r=Fe.matchMedia();for(t in e)r.add(t,e[t]);return r},Fe.addEventListener("matchMediaInit",function(){Tb(),Ub()}),Fe.addEventListener("matchMediaRevert",function(){return Sb()}),Fe.addEventListener("matchMedia",function(){Et(0,1),W("matchMedia")}),Fe.matchMedia().add("(orientation: portrait)",function(){return Lb(),Lb})):console.warn("Requires GSAP 3.11.0 or later"),Lb(),xb(Ue,"scroll",Kb);var e,t,r=He.hasAttribute("style"),n=He.style,i=n.borderTopStyle,o=Fe.core.Animation.prototype;for(o.revert||Object.defineProperty(o,"revert",{value:function value(){return this.time(-.01,!0)}}),n.borderTopStyle="solid",e=wt(He),Xe.m=Math.round(e.top+Xe.sc())||0,Ne.m=Math.round(e.left+Ne.sc())||0,i?n.borderTopStyle=i:n.removeProperty("border-top-style"),r||(He.setAttribute("style",""),He.removeAttribute("style")),u=setInterval(Jb,250),Fe.delayedCall(.5,function(){return at=0}),xb(Ue,"touchcancel",Ia),xb(He,"touchstart",Ia),wb(xb,Ue,"pointerdown,touchstart,mousedown",Ga),wb(xb,Ue,"pointerup,touchend,mouseup",Ha),f=Fe.utils.checkPrefix("transform"),Z.push(f),s=st(),c=Fe.delayedCall(.2,Et).pause(),g=[Ue,"visibilitychange",function(){var e=Je.innerWidth,t=Je.innerHeight;Ue.hidden?(d=e,p=t):d===e&&p===t||Mb()},Ue,"DOMContentLoaded",Et,Je,"load",Et,Je,"resize",Mb],Sa(xb),Ct.forEach(function(e){return e.enable(0,1)}),t=0;t<Ie.length;t+=3)zb(yb,Ie[t],Ie[t+1]),zb(yb,Ie[t],Ie[t+2])}else Ue&&Ue.addEventListener("DOMContentLoaded",function onLoad(){ScrollTrigger.enable(),Ue.removeEventListener("DOMContentLoaded",onLoad)})},ScrollTrigger.config=function config(e){"limitCallbacks"in e&&(rt=!!e.limitCallbacks);var t=e.syncInterval;t&&clearInterval(u)||(u=t)&&setInterval(Jb,t),"ignoreMobileResize"in e&&(b=1===ScrollTrigger.isTouch&&e.ignoreMobileResize),"autoRefreshEvents"in e&&(Sa(yb)||Sa(xb,e.autoRefreshEvents||"none"),h=-1===(e.autoRefreshEvents+"").indexOf("resize"))},ScrollTrigger.scrollerProxy=function scrollerProxy(e,t){var r=J(e),n=Ie.indexOf(r),i=Ma(r);~n&&Ie.splice(n,i?6:2),t&&(i?Le.unshift(Je,t,He,t,qe,t):Le.unshift(r,t))},ScrollTrigger.clearMatchMedia=function clearMatchMedia(t){Ct.forEach(function(e){return e._ctx&&e._ctx.query===t&&e._ctx.kill(!0,!0)})},ScrollTrigger.isInViewport=function isInViewport(e,t,r){var n=(ut(e)?J(e):e).getBoundingClientRect(),i=n[r?dt:pt]*t||0;return r?0<n.right-i&&n.left+i<Je.innerWidth:0<n.bottom-i&&n.top+i<Je.innerHeight},ScrollTrigger.positionInViewport=function positionInViewport(e,t,r){ut(e)&&(e=J(e));var n=e.getBoundingClientRect(),i=n[r?dt:pt],o=null==t?i/2:t in X?X[t]*i:~t.indexOf("%")?parseFloat(t)*i/100:parseFloat(t)||0;return r?(n.left+o)/Je.innerWidth:(n.top+o)/Je.innerHeight},ScrollTrigger.killAll=function killAll(e){if(Ct.slice(0).forEach(function(e){return"ScrollSmoother"!==e.vars.id&&e.kill()}),!0!==e){var t=q.killAll||[];q={},t.forEach(function(e){return e()})}},ScrollTrigger);function ScrollTrigger(e,t){s||ScrollTrigger.register(Fe)||console.warn("Please gsap.registerPlugin(ScrollTrigger)"),x(this),this.init(e,t)}re.version="3.15.1",re.saveStyles=function(e){return e?We(e).forEach(function(e){if(e&&e.style){var t=V.indexOf(e);0<=t&&V.splice(t,5),V.push(e,e.style.cssText,e.getBBox&&e.getAttribute("transform"),Fe.core.getCache(e),x())}}):V},re.revert=function(e,t){return Ub(!e,t)},re.create=function(e,t){return new re(e,t)},re.refresh=function(e){return e?Mb(!0):(s||re.register())&&Et(!0)},re.update=function(e){return++Ie.cache&&K(!0===e?2:0)},re.clearScrollMemory=Vb,re.maxScroll=function(e,t){return Ra(e,t?Ne:Xe)},re.getScrollFunc=function(e,t){return L(J(e),t?Ne:Xe)},re.getById=function(e){return Mt[e]},re.getAll=function(){return Ct.filter(function(e){return"ScrollSmoother"!==e.vars.id})},re.isScrolling=function(){return!!lt},re.snapDirectional=ub,re.addEventListener=function(e,t){var r=q[e]||(q[e]=[]);~r.indexOf(t)||r.push(t)},re.removeEventListener=function(e,t){var r=q[e],n=r&&r.indexOf(t);0<=n&&r.splice(n,1)},re.batch=function(e,t){function Mp(e,t){var r=[],n=[],i=Fe.delayedCall(o,function(){t(r,n),r=[],n=[]}).pause();return function(e){r.length||i.restart(!0),r.push(e.trigger),n.push(e),a<=r.length&&i.progress(1)}}var r,n=[],i={},o=t.interval||.016,a=t.batchMax||1e9;for(r in t)i[r]="on"===r.substr(0,2)&&Ua(t[r])&&"onRefreshInit"!==r?Mp(0,t[r]):t[r];return Ua(a)&&(a=a(),xb(re,"refresh",function(){return a=t.batchMax()})),We(e).forEach(function(e){var t={};for(r in i)t[r]=i[r];t.trigger=e,n.push(re.create(t))}),n};function vc(e,t,r,n){return n<t?e(n):t<0&&e(0),n<r?(n-t)/(r-t):r<0?t/(t-r):1}function wc(e,t){!0===t?e.style.removeProperty("touch-action"):e.style.touchAction=!0===t?"auto":t?"pan-"+t+(k.isTouch?" pinch-zoom":""):"none",e===qe&&wc(He,t)}function yc(e){var t,r=e.event,n=e.target,i=e.axis,o=(r.changedTouches?r.changedTouches[0]:r).target,a=o._gsap||Fe.core.getCache(o),s=st();if(!a._isScrollT||2e3<s-a._isScrollT){for(;o&&o!==He&&(o.scrollHeight<=o.clientHeight&&o.scrollWidth<=o.clientWidth||!ie[(t=nb(o)).overflowY]&&!ie[t.overflowX]);)o=o.parentNode;a._isScroll=o&&o!==n&&!Ma(o)&&(ie[(t=nb(o)).overflowY]||ie[t.overflowX]),a._isScrollT=s}!a._isScroll&&"x"!==i||(r.stopPropagation(),r._gsapAllow=!0)}function zc(e,t,r,n){return k.create({target:e,capture:!0,debounce:!1,lockAxis:!0,type:t,onWheel:n=n&&yc,onPress:n,onDrag:n,onScroll:n,onEnable:function onEnable(){return r&&xb(Ue,k.eventTypes[0],ae,!1,!0)},onDisable:function onDisable(){return yb(Ue,k.eventTypes[0],ae,!0)}})}function Dc(e){function Jq(){return i=!1}function Mq(){o=Ra(p,Xe),C=Ve(E?1:0,o),f&&(T=Ve(0,Ra(p,Ne))),l=kt}function Nq(){v._gsap.y=Ja(parseFloat(v._gsap.y)+b.offset)+"px",v.style.transform="matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, "+parseFloat(v._gsap.y)+", 0, 1)",b.offset=b.cacheID=0}function Tq(){Mq(),a.isActive()&&a.vars.scrollY>o&&(b()>o?a.progress(1)&&b(o):a.resetTo("scrollY",o))}Wa(e)||(e={}),e.preventDefault=e.isNormalizer=e.allowClicks=!0,e.type||(e.type="wheel,touch"),e.debounce=!!e.debounce,e.id=e.id||"normalizer";var n,o,l,i,a,c,u,s,f=e.normalizeScrollX,t=e.momentum,r=e.allowNestedScroll,d=e.onRelease,p=J(e.target)||qe,g=Fe.core.globals().ScrollSmoother,h=g&&g.get(),v=E&&(e.content&&J(e.content)||h&&!1!==e.content&&!h.smooth()&&h.content()),b=L(p,Xe),m=L(p,Ne),y=1,x=(k.isTouch&&Je.visualViewport?Je.visualViewport.scale*Je.visualViewport.width:Je.outerWidth)/Je.innerWidth,_=0,w=Ua(t)?function(){return t(n)}:function(){return t||2.8},S=zc(p,e.type,!0,r),T=Ia,C=Ia;return v&&Fe.set(v,{y:"+=0"}),e.ignoreCheck=function(e){return E&&"touchmove"===e.type&&function ignoreDrag(){if(i){requestAnimationFrame(Jq);var e=Ja(n.deltaY/2),t=C(b.v-e);if(v&&t!==b.v+b.offset){b.offset=t-b.v;var r=Ja((parseFloat(v&&v._gsap.y)||0)-b.offset);v.style.transform="matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, "+r+", 0, 1)",v._gsap.y=r+"px",b.cacheID=Ie.cache,K()}return!0}b.offset&&Nq(),i=!0}()||1.05<y&&"touchstart"!==e.type||n.isGesturing||e.touches&&1<e.touches.length},e.onPress=function(){i=!1;var e=y;y=Ja((Je.visualViewport&&Je.visualViewport.scale||1)/x),a.pause(),e!==y&&wc(p,1.01<y||!f&&"x"),c=m(),u=b(),Mq(),l=kt},e.onRelease=e.onGestureStart=function(e,t){if(b.offset&&Nq(),t){Ie.cache++;var r,n,i=w();f&&(n=(r=m())+.05*i*-e.velocityX/.227,i*=vc(m,r,n,Ra(p,Ne)),a.vars.scrollX=T(n)),n=(r=b())+.05*i*-e.velocityY/.227,i*=vc(b,r,n,Ra(p,Xe)),a.vars.scrollY=C(n),a.invalidate().duration(i).play(.01),(E&&a.vars.scrollY>=o||o-1<=r)&&Fe.to({},{onUpdate:Tq,duration:i})}else s.restart(!0);d&&d(e)},e.onWheel=function(){a._ts&&a.pause(),1e3<st()-_&&(l=0,_=st())},e.onChange=function(e,t,r,n,i){if(kt!==l&&Mq(),t&&f&&m(T(n[2]===t?c+(e.startX-e.x):m()+t-n[1])),r){b.offset&&Nq();var o=i[2]===r,a=o?u+e.startY-e.y:b()+r-i[1],s=C(a);o&&a!==s&&(u+=s-a),b(s)}(r||t)&&K()},e.onEnable=function(){wc(p,!f&&"x"),re.addEventListener("refresh",Tq),xb(Je,"resize",Tq),b.smooth&&(b.target.style.scrollBehavior="auto",b.smooth=m.smooth=!1),S.enable()},e.onDisable=function(){wc(p,!0),yb(Je,"resize",Tq),re.removeEventListener("refresh",Tq),S.kill()},e.lockAxis=!1!==e.lockAxis,((n=new k(e)).iOS=E)&&!b()&&b(1),E&&Fe.ticker.add(Ia),s=n._dc,a=Fe.to(n,{ease:"power4",paused:!0,inherit:!1,scrollX:f?"+=0.1":"+=0",scrollY:"+=0.1",modifiers:{scrollY:rc(b,b(),function(){return a.pause()})},onUpdate:K,onComplete:s.vars.onComplete}),n}var ne,ie={auto:1,scroll:1},oe=/(input|label|select|textarea)/i,ae=function _captureInputs(e){var t=oe.test(e.target.tagName);(t||ne)&&(e._gsapAllow=!0,ne=t)};re.sort=function(e){if(Ua(e))return Ct.sort(e);var t=Je.pageYOffset||0;return re.getAll().forEach(function(e){return e._sortY=e.trigger?t+e.trigger.getBoundingClientRect().top:e.start+Je.innerHeight}),Ct.sort(e||function(e,t){return-1e6*(e.vars.refreshPriority||0)+(e.vars.containerAnimation?1e6:e._sortY)-((t.vars.containerAnimation?1e6:t._sortY)+-1e6*(t.vars.refreshPriority||0))})},re.observe=function(e){return new k(e)},re.normalizeScroll=function(e){if(void 0===e)return v;if(!0===e&&v)return v.enable();if(!1===e)return v&&v.kill(),void(v=e);var t=e instanceof k?e:Dc(e);return v&&v.target===t.target&&v.kill(),Ma(t.target)&&(v=t),t},re.core={_getVelocityProp:M,_inputObserver:zc,_scrollers:Ie,_proxies:Le,bridge:{ss:function ss(){lt||W("scrollStart"),lt=st()},ref:function ref(){return je}}},La()&&Fe.registerPlugin(re),e.ScrollTrigger=re,e.default=re;if (typeof(window)==="undefined"||window!==e){Object.defineProperty(e,"__esModule",{value:!0})} else {delete e.default}});


window.YSKAR_SITE={"pages":{"home":"/","start":"/start","mine":"/mining","wallet":"/wallet","node":"/node","ysr":"/ysr","chain":"/chain","network":"/network","explorer":"/explorer","build":"/build","community":"/community","story":"/story","guides":"/anleitungen","protocol":"/protokoll","paper":"/whitepaper","imprint":"/impressum","privacy":"/datenschutz"},"langs":["en","de","es","pt","fr","it","pl","ru","tr","zh"],"locales":{"en":"en-US","de":"de-DE","es":"es-ES","pt":"pt-BR","fr":"fr-FR","it":"it-IT","pl":"pl-PL","ru":"ru-RU","tr":"tr-TR","zh":"zh-CN"},"texts":{"en":"646b69ff","de":"93e00b39","es":"f5c6ac54","pt":"3c4e35ec","fr":"17bd1aaa","it":"93aa9e39","pl":"67cb8fd3","ru":"b7eeb735","tr":"d94e7663","zh":"be33e735"},"img":{"fjord-dawn-p":"/assets/media/fjord-dawn-p.webp?v=51a3f3d3","fjord-dawn-w":"/assets/media/fjord-dawn-w.webp?v=acf443fd","fjord-mask":"/assets/media/fjord-mask.png?v=199e25d4","fjord-night-p":"/assets/media/fjord-night-p.webp?v=e4a2a63e","fjord-night-w":"/assets/media/fjord-night-w.webp?v=6a10a1cc","lanterns-off-p":"/assets/media/lanterns-off-p.webp?v=fe92fae4","lanterns-off":"/assets/media/lanterns-off.webp?v=b04b3ce3","lanterns-p":"/assets/media/lanterns-p.webp?v=e35713fb","lanterns":"/assets/media/lanterns.webp?v=5a350acc","laptop-de":"/assets/media/laptop-de.webp?v=8c6d34aa","laptop-en":"/assets/media/laptop-en.webp?v=e35ca738","node-sill":"/assets/media/node-sill.webp?v=2ac9ac29","wallet-desk-de":"/assets/media/wallet-desk-de.webp?v=61b20ba0","wallet-desk-en":"/assets/media/wallet-desk-en.webp?v=7f900418","wshot1-de":"/assets/media/wshot1-de.webp?v=891ff4ed","wshot1-en":"/assets/media/wshot1-en.webp?v=e272634c","wshot2-de":"/assets/media/wshot2-de.webp?v=08c98cc7","wshot2-en":"/assets/media/wshot2-en.webp?v=f5589849","wshot3-de":"/assets/media/wshot3-de.webp?v=3d390753","wshot3-en":"/assets/media/wshot3-en.webp?v=488e6a3f","wshot4-de":"/assets/media/wshot4-de.webp?v=57453d8b","wshot4-en":"/assets/media/wshot4-en.webp?v=1412abfa","wshot5-de":"/assets/media/wshot5-de.webp?v=ae0e6ab1","wshot5-en":"/assets/media/wshot5-en.webp?v=3edd7d63","wshot6-de":"/assets/media/wshot6-de.webp?v=a2349542","wshot6-en":"/assets/media/wshot6-en.webp?v=ee5bcaec"}};
/* ---- 00-sha256.js ---- */
/*
 * SHA-256 in reinem JavaScript. Die Seite rechnet damit Blockköpfe im Browser nach
 * (auch dort, wo crypto.subtle fehlt) und sucht in der Mining-Demo selbst nach Nonces.
 */
var Sha = (function () {
  'use strict';
  var K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  var INIT = new Int32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  var W = new Int32Array(64);

  /** Ein Kompressionsschritt: 64 Byte ab `off` in den Zustand H einrechnen. */
  function compress(H, M, off) {
    var i, j, a, b, c, d, e, f, g, h, x, y, t1, t2;
    for (i = 0; i < 16; i++) { j = off + i * 4; W[i] = (M[j] << 24) | (M[j + 1] << 16) | (M[j + 2] << 8) | M[j + 3]; }
    for (i = 16; i < 64; i++) {
      x = W[i - 15]; y = W[i - 2];
      W[i] = (W[i - 16] + (((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3)) + W[i - 7] +
        (((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10))) | 0;
    }
    a = H[0]; b = H[1]; c = H[2]; d = H[3]; e = H[4]; f = H[5]; g = H[6]; h = H[7];
    for (i = 0; i < 64; i++) {
      t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  function digest(bytes) {
    var n = bytes.length, total = ((n + 9 + 63) >> 6) << 6, M = new Uint8Array(total), H = new Int32Array(INIT), i, out = new Uint8Array(32);
    M.set(bytes); M[n] = 0x80;
    var bits = n * 8;
    M[total - 4] = bits >>> 24; M[total - 3] = (bits >>> 16) & 255; M[total - 2] = (bits >>> 8) & 255; M[total - 1] = bits & 255;
    for (i = 0; i < total; i += 64) compress(H, M, i);
    for (i = 0; i < 8; i++) { out[i * 4] = H[i] >>> 24; out[i * 4 + 1] = (H[i] >>> 16) & 255; out[i * 4 + 2] = (H[i] >>> 8) & 255; out[i * 4 + 3] = H[i] & 255; }
    return out;
  }

  function twice(bytes) { return digest(digest(bytes)); }

  /**
   * Nonce-Suche über einem 136-Byte-Kopf. Die ersten 128 Byte werden einmal eingerechnet
   * (Zwischenstand); je Versuch bleiben zwei Kompressionsschritte – genau wie im Protokoll beschrieben.
   * target: 8 Wörter (big-endian) als Int32Array, verglichen wird vorzeichenlos.
   */
  function makeSearch(header) {
    var mid = new Int32Array(INIT);
    compress(mid, header, 0); compress(mid, header, 64);
    var tail = new Uint8Array(64);
    tail[8] = 0x80; tail[62] = 0x04; tail[63] = 0x40;            // 136 Byte = 1088 Bit
    var outer = new Uint8Array(64);
    outer[32] = 0x80; outer[62] = 0x01; outer[63] = 0x00;         // 32 Byte = 256 Bit
    var H1 = new Int32Array(8), H2 = new Int32Array(8);
    return function search(start, count, target) {
      var n, i, lo, hi, found = -1;
      for (n = start; n < start + count; n++) {
        lo = n >>> 0; hi = Math.floor(n / 4294967296) >>> 0;
        tail[0] = lo & 255; tail[1] = (lo >>> 8) & 255; tail[2] = (lo >>> 16) & 255; tail[3] = lo >>> 24;
        tail[4] = hi & 255; tail[5] = (hi >>> 8) & 255; tail[6] = (hi >>> 16) & 255; tail[7] = hi >>> 24;
        H1.set(mid); compress(H1, tail, 0);
        for (i = 0; i < 8; i++) { outer[i * 4] = H1[i] >>> 24; outer[i * 4 + 1] = (H1[i] >>> 16) & 255; outer[i * 4 + 2] = (H1[i] >>> 8) & 255; outer[i * 4 + 3] = H1[i] & 255; }
        H2.set(INIT); compress(H2, outer, 0);
        for (i = 0; i < 8; i++) {
          var a = H2[i] >>> 0, b = target[i] >>> 0;
          if (a < b) { found = n; break; }
          if (a > b) break;
          if (i === 7) found = n;                                 // gleich dem Ziel gilt
        }
        if (found >= 0) break;
      }
      return { nonce: found, tried: (found >= 0 ? found - start + 1 : count) };
    };
  }

  return { digest: digest, twice: twice, makeSearch: makeSearch };
})();

/* ---- 01-util.js ---- */
/* Kleine Helfer: DOM, Bytes, Protokollformeln, Zahlenformate. */
var U = (function () {
  'use strict';
  var UNIT = 100000000, EPOCH = 12000, REWARD0 = 875 * UNIT, V6 = 10000;
  var listeners = {};

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, data) { (listeners[evt] || []).forEach(function (fn) { try { fn(data); } catch (e) { if (window.console) console.error(e); } }); }

  /* ---- Bytes ---- */
  function hexToBytes(hex) {
    var out = new Uint8Array(hex.length >> 1), i;
    for (i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function bytesToHex(b) {
    var s = '', i;
    for (i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return s;
  }
  function le(b, off, len) {           // kleine Zahlen (bis 2^53) little-endian
    var v = 0, i;
    for (i = len - 1; i >= 0; i--) v = v * 256 + b[off + i];
    return v;
  }
  function leBig(b, off, len) {
    var v = BigInt(0), i;
    for (i = len - 1; i >= 0; i--) v = v * BigInt(256) + BigInt(b[off + i]);
    return v;
  }

  /* ---- Protokoll ---- */
  /** Difficulty-Feld (4 Byte) lesen; ab 2^31 Gleitkomma-Schreibweise (Konsensfassung 4). */
  function decodeDifficulty(field) {
    var f = BigInt(field);
    if (f < (BigInt(1) << BigInt(31))) return f;
    var e = (f >> BigInt(23)) & BigInt(255), m = (f & BigInt(0x7fffff)) | (BigInt(1) << BigInt(23));
    return m << e;
  }
  /** target = floor(2^240 / difficulty), als 64 Hexzeichen */
  function targetHex(diff) {
    var t = (BigInt(1) << BigInt(240)) / BigInt(diff), s = t.toString(16);
    while (s.length < 64) s = '0' + s;
    return s;
  }
  var FIELDS = [
    { id: 'version', off: 0, len: 4 }, { id: 'height', off: 4, len: 4 }, { id: 'prev', off: 8, len: 32 },
    { id: 'merkle', off: 40, len: 32 }, { id: 'state', off: 72, len: 32 }, { id: 'time', off: 104, len: 8 },
    { id: 'diff', off: 112, len: 4 }, { id: 'count', off: 116, len: 4 }, { id: 'extra', off: 120, len: 8 },
    { id: 'nonce', off: 128, len: 8 }];
  function parseHeader(hex) {
    var b = hexToBytes(hex);
    return {
      bytes: b,
      version: le(b, 0, 4), height: le(b, 4, 4),
      prev: bytesToHex(b.subarray(8, 40)), merkle: bytesToHex(b.subarray(40, 72)), state: bytesToHex(b.subarray(72, 104)),
      time: le(b, 104, 8), diffField: le(b, 112, 4), difficulty: decodeDifficulty(le(b, 112, 4)),
      count: le(b, 116, 4), extra: leBig(b, 120, 8), nonce: leBig(b, 128, 8)
    };
  }
  /** Rechnet den Blockkopf nach: zweimal SHA-256, Vergleich mit dem Ziel. */
  function verifyHeader(hex) {
    var h = parseHeader(hex), clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now;
    var first = Sha.digest(h.bytes), hash = bytesToHex(Sha.digest(first)), target = targetHex(h.difficulty);
    // Zeit je Prüfung: über viele Durchläufe gemittelt, weil eine einzelne unter der Auflösung der Uhr liegt
    var reps = 200, t0 = clock(), i;
    for (i = 0; i < reps; i++) Sha.twice(h.bytes);
    var ms = (clock() - t0) / reps;
    return { header: h, first: bytesToHex(first), hash: hash, target: target, valid: hash <= target, ms: ms };
  }
  function rewardAt(height) {
    var era = Math.floor(height / EPOCH);
    return era >= 63 ? 0 : Math.floor(REWARD0 / Math.pow(2, era));
  }
  /** Summe aller Belohnungen bis einschließlich Block `height`, in Einheiten. */
  function mintedAt(height) {
    var n = height + 1, eras = Math.floor(n / EPOCH), rem = n % EPOCH, sum = 0, k;
    for (k = 0; k < eras && k < 63; k++) sum += EPOCH * Math.floor(REWARD0 / Math.pow(2, k));
    if (eras < 63) sum += rem * Math.floor(REWARD0 / Math.pow(2, eras));
    return sum;
  }

  /* ---- Formate ---- */
  /** Schreibweise von Zahlen und Daten in der gewählten Sprache (site.json nennt sie je Sprache). */
  function loc() {
    var map = (window.YSKAR_SITE && window.YSKAR_SITE.locales) || {};
    return map[document.documentElement.lang || 'en'] || 'en-US';
  }
  var seps = {};
  function decimalSep() {
    var l = loc();
    if (!seps[l]) { try { seps[l] = (1.5).toLocaleString(l).replace(/[0-9]/g, '') || '.'; } catch (e) { seps[l] = '.'; } }
    return seps[l];
  }
  function num(x, max, min) {
    return Number(x).toLocaleString(loc(), { maximumFractionDigits: max === undefined ? 0 : max, minimumFractionDigits: min || 0 });
  }
  function compact(x, digits) {
    try {
      return new Intl.NumberFormat(loc(), { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: digits === undefined ? 1 : digits }).format(x);
    } catch (e) { return num(x); }
  }
  /** Betrag aus Einheiten (Zahl oder Ziffernfolge) als YSR, genau bis zur 8. Stelle, Nullen am Ende weg. */
  function ysr(units, opt) {
    opt = opt || {};
    var u = BigInt(String(units).split('.')[0]), neg = u < BigInt(0);
    if (neg) u = -u;
    var whole = u / BigInt(UNIT), frac = (u % BigInt(UNIT)).toString();
    while (frac.length < 8) frac = '0' + frac;
    var max = opt.max === undefined ? 8 : opt.max;
    frac = frac.slice(0, max).replace(/0+$/, '');
    while (frac.length < (opt.min || 0)) frac += '0';
    var sep = decimalSep();
    return (neg ? '−' : '') + Number(whole).toLocaleString(loc()) + (frac ? sep + frac : '') + (opt.bare ? '' : ' YSR');
  }
  function hashrate(h) {
    var st = [[1e15, 'PH/s'], [1e12, 'TH/s'], [1e9, 'GH/s'], [1e6, 'MH/s'], [1e3, 'kH/s']], i;
    if (!(h > 0)) return '—';
    for (i = 0; i < st.length; i++) if (h >= st[i][0]) return num(h / st[i][0], 2) + ' ' + st[i][1];
    return num(h, 0) + ' H/s';
  }
  function shortHash(h, a, b) {
    a = a === undefined ? 10 : a; b = b === undefined ? 8 : b;
    return h.length <= a + b + 1 ? h : h.slice(0, a) + '…' + h.slice(-b);
  }
  function date(ts, withTime) {
    var d = new Date(ts * 1000), o = { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    if (withTime) { o.hour = '2-digit'; o.minute = '2-digit'; o.hour12 = false; }
    return d.toLocaleString(loc(), o) + (withTime ? ' UTC' : '');
  }
  function dayLabel(iso) {            // "2026-11-10" -> "10 Nov" / "10. Nov."
    var p = iso.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString(loc(), { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }
  function store(key, value) {
    try {
      if (value === undefined) return window.localStorage.getItem(key);
      window.localStorage.setItem(key, value);
    } catch (e) { /* ohne Speicher läuft alles weiter */ }
    return null;
  }
  function copyText(text, btn, doneLabel) {
    function ok() {
      if (!btn) return;
      var old = btn.textContent; btn.textContent = doneLabel || '✓'; btn.classList.add('done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1600);
    }
    function fallback() {
      try {
        var ta = el('textarea', { style: 'position:fixed;left:-999px;top:0', 'aria-hidden': 'true' });
        ta.value = text; document.body.appendChild(ta); ta.select();
        var done = document.execCommand('copy'); document.body.removeChild(ta);
        if (done) ok();
      } catch (e) { /* Kopieren ist hier nicht erlaubt */ }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
      else fallback();
    } catch (e) { fallback(); }
  }

  /* ---- Schwebender Hinweis ---- */
  var tipEl = null;
  function tipShow(node, x, y) {
    tipEl = tipEl || document.getElementById('tip');
    tipEl.textContent = ''; tipEl.appendChild(node); tipEl.hidden = false;
    var w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth, left = x + 14, top = y - h - 12;
    if (left + w > vw - 8) left = x - w - 14;
    if (left < 8) left = 8;
    if (top < 8) top = y + 16;
    tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
  }
  function tipHide() { if (tipEl) tipEl.hidden = true; }

  return {
    $: $, $$: $$, el: el, on: on, emit: emit,
    hexToBytes: hexToBytes, bytesToHex: bytesToHex, le: le, leBig: leBig,
    FIELDS: FIELDS, parseHeader: parseHeader, verifyHeader: verifyHeader, targetHex: targetHex, decodeDifficulty: decodeDifficulty,
    rewardAt: rewardAt, mintedAt: mintedAt, UNIT: UNIT, EPOCH: EPOCH, V6: V6,
    loc: loc, num: num, compact: compact, ysr: ysr, hashrate: hashrate, shortHash: shortHash, date: date, dayLabel: dayLabel,
    store: store, copyText: copyText, tipShow: tipShow, tipHide: tipHide
  };
})();

/* ---- 03-i18n.js ---- */
/*
 * Sprache. Die Seiten tragen englischen Text; hier wird er durch die gewählte Sprache ersetzt.
 * Welche das ist, hat das Skript im Kopf der Seite schon entschieden (?lang=, gemerkte Wahl, Sprache des Browsers,
 * sonst Englisch) und ihre Texte angefordert. Die Wahl des Besuchers bleibt im Browser gespeichert (yskar.sprache).
 *
 *   data-t="schluessel"            Inhalt des Elements
 *   data-ta="attribut:schluessel"  ein Attribut (mehrere Paare mit ; getrennt)
 */
var I18n = (function () {
  'use strict';
  var SITE = window.YSKAR_SITE || {}, LANGS = SITE.langs || ['en'], VERSION = SITE.texts || {}, KEEP = 'yskar.sprache';
  var T = window.YSKAR_TEXTE = window.YSKAR_TEXTE || {};
  var lang = LANGS.indexOf(window.YSKAR_LANG) >= 0 ? window.YSKAR_LANG : 'en', waiting = [], reported = {}, failed = window.YSKAR_AUS || {}, rules = {};

  function has(key) { return !!T[lang] && T[lang][key] !== undefined; }
  function t(key, vars) {
    var s = T[lang] && T[lang][key], k;
    if (s === undefined) {
      if (!reported[key] && window.console) { reported[key] = true; console.error('[YSKAR] Text fehlt: ' + key); }
      return key;
    }
    if (vars) for (k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  /**
   * Text zu einer Anzahl. Wählt die Form nach den Regeln der Sprache: "1 block", "2 blocks"; Russisch und Polnisch
   * kennen eine dritte ("2 блока", "5 блоков") und für Kommazahlen eine vierte ("2,5 года"). Schlüssel: `key`
   * (Grundform: viele), `key.1` (Einzahl) und, nur wo die Sprache sie braucht, `key.few` und `key.frac`.
   * Die Zahl selbst kommt wie jeder andere Wert über `vars` in den Text.
   */
  function tn(key, n, vars) {
    var kind = 'other', table = T[lang] || {};
    try { kind = plural().select(Number(n)); } catch (e) { kind = Number(n) === 1 ? 'one' : 'other'; }
    if (kind === 'one' && table[key + '.1'] !== undefined) return t(key + '.1', vars);
    if (kind === 'few' && table[key + '.few'] !== undefined) return t(key + '.few', vars);
    if (kind === 'other' && table[key + '.frac'] !== undefined) return t(key + '.frac', vars);
    return t(key, vars);
  }
  function plural() {
    if (!rules[lang]) rules[lang] = new Intl.PluralRules((SITE.locales && SITE.locales[lang]) || lang);
    return rules[lang];
  }
  function apply(root) {
    U.$$('[data-t]', root).forEach(function (e) { e.innerHTML = t(e.getAttribute('data-t')); });
    U.$$('[data-ta]', root).forEach(function (e) {
      e.getAttribute('data-ta').split(';').forEach(function (pair) {
        var p = pair.split(':');
        e.setAttribute(p[0], t(p[1]).replace(/<[^>]+>/g, ''));
      });
    });
    if (window.Img) Img.apply(root);
  }
  /** Die Texte einer Sprache holen, falls sie noch nicht da sind. `done(true)`, sobald sie stehen; `done(false)`, wenn die Datei nicht kam. */
  function load(l, done) {
    if (T[l]) return void done(true);
    var old = document.querySelector('script[data-texts="' + l + '"]');
    if (old && failed[l]) { old.parentNode.removeChild(old); old = null; failed[l] = false; }
    waiting.push({ l: l, done: done });
    if (old) return;                                   // schon angefordert, vom Skript im Kopf der Seite oder von einem früheren Aufruf
    var s = document.createElement('script');
    s.async = true; s.setAttribute('data-texts', l); s.src = '/assets/i18n/' + l + '.js?v=' + (VERSION[l] || '');
    s.onerror = function () { window.YSKAR_TEXTE_AUS(l); };
    document.head.appendChild(s);
  }
  function arrived(l, ok) {
    var rest = [];
    waiting.forEach(function (w) { if (w.l === l) w.done(ok && !!T[l]); else rest.push(w); });
    waiting = rest;
  }
  window.YSKAR_TEXTE_DA = function (l) { arrived(l, true); };
  window.YSKAR_TEXTE_AUS = function (l) { failed[l] = true; arrived(l, false); };

  function show(l, quiet) {
    lang = l;
    document.documentElement.lang = lang;
    apply(document);
    U.$$('[data-lang-select]').forEach(function (s) { s.value = lang; });
    document.documentElement.classList.remove('lang-wait');
    if (!quiet) U.emit('lang', lang);
  }
  /** Sprache wechseln (Auswahl im Menü und im Fuß); die Wahl wird gemerkt. */
  function set(l) {
    if (LANGS.indexOf(l) < 0 || l === lang) return;
    load(l, function (ok) {
      if (!ok) return void U.$$('[data-lang-select]').forEach(function (s) { s.value = lang; });      // Texte kamen nicht: Auswahl zurückstellen
      U.store(KEEP, l); show(l, false);
    });
  }
  /**
   * Beim Start: wartet auf die Texte der gewählten Sprache und ruft dann `done`. Kommen sie nicht, bleibt es bei Englisch.
   * Kommen auch die englischen Texte nicht, startet das Programm nicht: Die Seite bleibt, wie sie geliefert wurde.
   */
  function ready(done) {
    load(lang, function (ok) {
      if (ok) return void done();
      document.documentElement.classList.remove('lang-wait');
      if (lang === 'en') return;
      lang = 'en'; document.documentElement.lang = 'en';
      load('en', function (ok2) { if (ok2) done(); });
    });
  }
  function init() {
    show(lang, true);
    document.addEventListener('change', function (e) {
      var s = e.target;
      if (s && s.matches && s.matches('[data-lang-select]')) set(s.value);
    });
  }
  return { t: t, tn: tn, has: has, set: set, init: init, ready: ready, apply: apply, lang: function () { return lang; } };
})();
var t = I18n.t, tn = I18n.tn;

/* ---- 04-img.js ---- */
/*
 * Bilder. Jedes <img> mit dem Attribut data-img bekommt seine Quelle aus dem Bildverzeichnis der Seite (tools/build.mjs).
 * Varianten: name-p / name-w (Hochformat / Querformat, nur mit data-orient) und name-en / name-de (Sprache).
 */
var Img = (function () {
  'use strict';
  var IMG = (window.YSKAR_SITE || {}).img || {}, mq = window.matchMedia ? window.matchMedia('(max-aspect-ratio: 4/5)') : null;

  function orient() { return mq && mq.matches ? 'p' : 'w'; }
  function pick(name, withOrient) {
    var lang = document.documentElement.lang === 'de' ? 'de' : 'en', o = withOrient ? orient() : null, c = [];
    if (o) c.push(name + '-' + o + '-' + lang, name + '-' + o);
    c.push(name + '-' + lang, name + '-en', name);
    if (o) c.push(name + '-w', name + '-p');
    for (var i = 0; i < c.length; i++) if (IMG[c[i]]) return IMG[c[i]];
    return null;
  }
  function apply(root) {
    U.$$('[data-img]', root || document).forEach(function (e) {
      var src = pick(e.getAttribute('data-img'), e.hasAttribute('data-orient'));
      if (!src || e.getAttribute('src') === src) return;
      if (!e.hasAttribute('data-lazy') || e._seen) set(e, src); else e._want = src;
    });
  }
  function set(e, src) {
    e.setAttribute('src', src);
    if (e.complete) e.classList.add('is-loaded'); else e.addEventListener('load', function () { e.classList.add('is-loaded'); }, { once: true });
  }
  function init() {
    if (mq) { var f = function () { apply(document); U.emit('orient', orient()); }; if (mq.addEventListener) mq.addEventListener('change', f); else if (mq.addListener) mq.addListener(f); }
    // Bilder mit data-lazy erst laden, wenn sie in die Nähe des Bildausschnitts kommen
    var lazy = U.$$('img[data-lazy]');
    if (!('IntersectionObserver' in window)) { lazy.forEach(function (e) { e._seen = true; }); apply(document); return; }
    var io = new IntersectionObserver(function (list) {
      list.forEach(function (en) {
        if (!en.isIntersecting) return;
        var e = en.target; e._seen = true; io.unobserve(e);
        if (e._want) { set(e, e._want); e._want = null; } else apply(e.parentNode);
      });
    }, { rootMargin: '900px 0px' });
    lazy.forEach(function (e) { io.observe(e); });
    // nach einem Seitenwechsel sind bisher verborgene Bilder erst messbar
    U.on('route', function () { lazy.forEach(function (e) { if (!e._seen) { io.unobserve(e); io.observe(e); } }); });
  }
  return { apply: apply, init: init, orient: orient, url: function (name) { return IMG[name] || null; } };
})();

/* ---- 10-router.js ---- */
/*
 * Wegweiser. Jede Seite ist ein eigenes Dokument mit eigener Adresse (/mining, /chain, /explorer …);
 * welche es ist, steht am <html data-page>. Verweise zwischen Seiten sind gewöhnliche Links.
 *
 * Hier liegt, was darüber hinausgeht:
 *   - href('#mine') / href('#explorer-block-12') macht aus der Schreibweise der Quellen die Adresse
 *     ("/mining", "/explorer#block-12"), für Links, die ein Skript baut
 *   - das Ereignis "route": beim Start und immer, wenn sich der Anker ändert (der Explorer liest ihn aus)
 *   - ein Klick auf die Seite, die schon offen ist, lädt sie nicht neu, sondern führt an ihren Anfang
 *   - der Seitentitel in der gewählten Sprache
 */
var Router = (function () {
  'use strict';
  var SITE = window.YSKAR_SITE || { pages: {} }, PATHS = SITE.pages;
  var page = document.documentElement.getAttribute('data-page') || 'home', last = null;

  function href(ref) {
    var h = String(ref).replace(/^#/, ''), i = h.indexOf('-'), p = i < 0 ? h : h.slice(0, i);
    if (!PATHS.hasOwnProperty(p)) return '#' + h;
    if (i < 0) return PATHS[p];
    return (p === page ? '' : PATHS[p]) + '#' + h.slice(i + 1);
  }
  function parse() {
    var h = (location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* so lassen */ }
    return { page: page, rest: h };
  }
  /** Zu einer Seite oder einem Anker gehen, in der Schreibweise der Quellen: go('#explorer-block-12'). */
  function go(ref) {
    var url = href(ref);
    if (url.charAt(0) === '#') { if (location.hash === url) changed(true); else location.hash = url; return; }
    if (url === location.pathname && PATHS[page] === url) { if (location.hash) history.pushState(null, '', url); window.scrollTo(0, 0); changed(true); return; }
    location.href = url;
  }
  function title() {
    if (!I18n.has('title.' + page)) return;
    document.title = (page === 'home' ? 'YSKAR – ' + t('title.home') : t('title.' + page) + ' – YSKAR').replace(/<[^>]+>/g, '');
  }
  function changed(force) {
    var now = location.pathname + location.search + location.hash;
    if (now === last && !force) return;
    last = now;
    if (window.UI && UI.closeMenu) UI.closeMenu(true);
    U.emit('route', parse());
  }
  function sameDocument(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]'), u;
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (u.origin !== location.origin || u.pathname !== location.pathname || u.search !== location.search || u.hash) return;
    // dieselbe Seite ohne Anker: nicht neu laden, sondern an den Anfang
    e.preventDefault();
    if (location.hash) history.pushState(null, '', u.pathname + u.search);
    window.scrollTo(0, 0);
    var m = document.getElementById('main'); if (m && m.focus) m.focus({ preventScroll: true });
    changed();
  }
  function init() {
    last = location.pathname + location.search + location.hash;
    document.addEventListener('click', sameDocument);
    window.addEventListener('hashchange', function () { changed(); });
    window.addEventListener('popstate', function () { changed(); });
    U.on('lang', title);
    title();
    // Ein Anker aus der Adresse: Der Browser springt hin, bevor die Seite ihre endgültige Höhe hat. Solange der Besucher
    // nicht selbst gescrollt hat, noch einmal hinspringen, wenn alles steht.
    var r = parse(), el = r.rest ? document.getElementById(r.rest) : null;
    if (el) {
      var moved = false, jump = function () { if (!moved) el.scrollIntoView({ block: 'start' }); };
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach(function (n) { window.addEventListener(n, function () { moved = true; }, { once: true, passive: true }); });
      setTimeout(jump, 80);
      if (document.readyState === 'complete') setTimeout(jump, 400); else window.addEventListener('load', function () { setTimeout(jump, 250); });
    }
    U.emit('route', r);
  }
  return { init: init, parse: parse, href: href, go: go, current: function () { return page; }, PAGES: Object.keys(PATHS) };
})();

/* ---- 11-live.js ---- */
/*
 * Der Stand der Kette. Die Seite liest ihn aus der öffentlichen YSKAR-API (nur GET, derselbe Rechner: /api/v2)
 * und fragt alle 45 Sekunden neu.
 *
 * Bis die erste Antwort da ist, und falls die API einmal nicht antwortet, gilt der Stand aus assets/data/kette.js
 * (der beim letzten Bau der Seite) oder die letzte Antwort, die diese Seite schon erhalten hat. Solange das so ist,
 * steht am <html> data-mode="snapshot" und die Seite nennt das Datum dieses Stands, statt ihn als "jetzt" auszugeben.
 *
 * Im Browser wird davon nichts gespeichert.
 */
var Live = (function () {
  'use strict';
  var SNAP = window.YSKAR_SNAPSHOT, API = '/api/v2', PUBLIC = 'https://www.yskar.app/api/v2';
  var S = {
    mode: 'snapshot', at: SNAP.takenAt, summary: SNAP.summary, supply: SNAP.supply, pools: SNAP.pools, fees: SNAP.fees,
    blocks: SNAP.blocks.slice(),
    tried: false                 // true, sobald der erste Leseversuch beendet ist (gelungen oder nicht)
  };
  var timer = null, busy = false, started = false, pending = false;

  function get(path, ms) {
    var ctl = window.AbortController ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 8000);
    return fetch(API + path, { cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
        function (e) { clearTimeout(to); throw e; });
  }
  function valid(sum, bl) { return !!sum && typeof sum.height === 'number' && !!bl && !!bl.blocks && bl.blocks.length > 0 && !!bl.blocks[0].header; }

  function take(sum, bl) {
    S.summary = sum; S.blocks = bl.blocks; S.mode = 'live'; S.at = Math.floor(Date.now() / 1000);
  }

  function refresh() {
    if (busy) return Promise.resolve(false);
    if (!window.fetch) { S.tried = true; return Promise.resolve(false); }
    busy = true;
    return Promise.all([get('/summary'), get('/blocks?limit=50')]).then(function (r) {
      if (!valid(r[0], r[1])) throw new Error('unerwartete Antwort');
      take(r[0], r[1]);
      return extras();
    }).then(function () { busy = false; S.tried = true; publish(); return true; },
      function () {
        busy = false; S.tried = true;
        if (Date.now() / 1000 - S.at > 180) S.mode = 'snapshot';       // seit drei Minuten keine Antwort: der Stand gilt nicht mehr als "jetzt"
        publish(); return false;
      });
  }
  /** Pools, Menge und Gebühren: Zugaben. Fehlt eine, bleibt der letzte bekannte Wert stehen. */
  function extras() {
    return Promise.all([get('/pools').catch(nil), get('/supply').catch(nil), get('/fees').catch(nil)]).then(function (r) {
      if (r[0] && r[0].pools) S.pools = r[0];
      if (r[1] && r[1].max) S.supply = r[1];
      if (r[2] && r[2].minFee) S.fees = r[2];
    });
  }
  function nil() { return null; }

  /**
   * Vor dem Start des Programms kurz auf die Abfrage warten, die der Kopf der Seite schon losgeschickt hat:
   * So zeigt schon das erste Bild den Stand von jetzt. Kommt die Antwort nicht rechtzeitig, startet die Seite mit dem
   * Stand aus assets/data/kette.js und holt den neuen nach.
   */
  function prime(done) {
    var early = window.YSKAR_EARLY, gone = false;
    function go() { if (gone) return; gone = true; done(); }
    if (!early) return void go();
    pending = true;
    early.then(function (r) {
      pending = false;
      if (r && valid(r.summary, r.blocks)) {
        take(r.summary, r.blocks); S.at = Math.floor(r.at / 1000); S.tried = true;
        if (started) publish();
        busy = true;
        extras().then(function () { busy = false; if (started) publish(); });
      } else if (started) refresh();
      go();
    });
    setTimeout(go, 700);
  }

  function avgBlockTime() {
    var b = S.blocks, n = Math.min(b.length, 50);
    if (n < 3) return 600;
    return (Number(b[0].timestamp) - Number(b[n - 1].timestamp)) / (n - 1);
  }
  function duration(sec) {
    if (sec < 5400) return t('unit.min', { n: U.num(Math.max(1, Math.round(sec / 60))) });
    if (sec < 172800) return t('unit.hours', { n: U.num(sec / 3600, 0) });
    return t('unit.days', { n: U.num(sec / 86400, sec < 864000 ? 1 : 0) });
  }
  function ago(ts, ref) {
    var d = Math.max(0, ref - ts);
    if (d < 90) return t('ago.sec', { n: U.num(Math.max(1, d)) });
    if (d < 5400) return t('ago.min', { n: U.num(Math.round(d / 60)) });
    if (d < 172800) return t('ago.hours', { n: U.num(Math.round(d / 3600)) });
    return t('ago.days', { n: U.num(Math.round(d / 86400)) });
  }
  /** Wie ago(), aber ausgeschrieben, für Sätze in Überschriftgröße: "3 minutes ago", "vor 3 Minuten". */
  function agoLong(ts, ref) {
    var d = Math.max(0, ref - ts), n, k;
    if (d < 90) { n = Math.max(1, d); k = 'sec'; }
    else if (d < 5400) { n = Math.round(d / 60); k = 'min'; }
    else if (d < 172800) { n = Math.round(d / 3600); k = 'hours'; }
    else { n = Math.round(d / 86400); k = 'days'; }
    return tn('agol.' + k, n, { n: U.num(n) });
  }
  /** Bezugszeit für "vor … Minuten": live die Uhr, im Schnappschuss der Zeitpunkt der Aufnahme. */
  function now() { return S.mode === 'live' ? Math.floor(Date.now() / 1000) : S.at; }

  function values() {
    var s = S.summary, h = s.height, tip = S.blocks[0], avg = avgBlockTime();
    var era = Math.floor(h / U.EPOCH), nextHalving = (era + 1) * U.EPOCH;
    var minted = Number(s.totalSupply), max = Number(s.maxSupply);
    var tipTime = Number(tip.timestamp), v6Left = Math.max(0, U.V6 - h), halvingLeft = nextHalving - h;
    var diff = BigInt(s.difficultyWert || s.difficulty), attempts = Number(diff) * 65536;
    var tot = Chain.totals(), f = tot.finders1000 || {}, fsum = (f.main || 0) + (f.gozero || 0) + (f.solo || 0) + (f.other || 0) || 1;
    var snapDate = U.date(S.at, true), histTip = Chain.exactTip();
    var dayN = Math.floor((now() - Chain.get().t0) / 86400) + 1;
    var nodesN = Number(s.knoten || 0), eraLeft = nextHalving - h;
    var v = {
      height: U.num(h), heightHash: '#' + U.num(h),
      tipAge: ago(tipTime, now()), tipAgeLong: agoLong(tipTime, now()), tipTime: U.date(tipTime, true),
      hashrate: U.hashrate(s.hashrate), difficulty: U.num(Number(diff)),
      attempts: U.compact(attempts, 0),
      reward: U.ysr(s.nextReward), rewardAfter: U.ysr(U.rewardAt(nextHalving)),
      minted: U.ysr(minted, { max: 0 }), mintedPct: U.num(minted / max * 100, 1, 1) + ' %',
      circulating: U.num(parseFloat(S.supply.circulating), 0) + ' YSR',
      burned: U.num(parseFloat(S.supply.unspendable), 0) + ' YSR',
      burnedExact: U.num(parseFloat(S.supply.unspendable), 8, 2) + ' YSR',
      era: U.num(era + 1), eraRange: U.num(era * U.EPOCH) + '–' + U.num(nextHalving - 1),
      halvingHeight: U.num(nextHalving), halvingLeft: U.num(halvingLeft),
      halvingEta: t('eta.around', { d: duration(halvingLeft * avg), date: U.date(tipTime + halvingLeft * avg) }),
      v6Left: U.num(v6Left),
      v6Eta: v6Left > 0 ? t('eta.around', { d: duration(v6Left * avg), date: U.date(tipTime + v6Left * avg) }) : t('v6.active'),
      v6State: v6Left > 0 ? t('v6.pending', { n: U.num(v6Left) }) : t('v6.active'),
      mempool: U.num(s.mempool || 0), miners: U.num(s.activeMiners || 0), sessions: U.num(s.miningSessions || 0), nodes: U.num(s.knoten || 0),
      avgTime: U.num(avg, 0) + ' s', avgTimeMin: U.num(avg / 60, 1) + ' min',
      feeStd: U.ysr(S.fees.minFee), feeBytes: U.num(S.fees.basisBytes || 168),
      transfers: U.num(tot.transfers), blocksTotal: U.num(h + 1),
      avgAll: U.num(tot.avgBlockTime, 0) + ' s',
      shareGozero: U.num((f.gozero || 0) / fsum * 100, 1) + ' %', shareMain: U.num((f.main || 0) / fsum * 100, 1) + ' %',
      shareSolo: U.num((f.solo || 0) / fsum * 100, 1) + ' %',
      poolCount: U.num((S.pools.pools || []).length),
      supplyCirc: String(S.supply.circulating), supplyTotal: String(S.supply.total), supplyMax: String(S.supply.max),
      histState: t('mode.history', { h: U.num(histTip) }),
      snapTip: U.num(histTip), snapDate: snapDate,
      day: U.num(dayN), nodesNext: U.num(nodesN + 1), nextHeight: U.num(h + 1),
      eraLeft: U.num(eraLeft), eraPct: U.num((h - era * U.EPOCH) / U.EPOCH * 100, 0) + ' %',
      rewardNow: U.num(Number(s.nextReward) / 1e8, 4), rewardNext: U.num(U.rewardAt(nextHalving) / 1e8, 4),
      heroLine: t('home.hero.live', { d: U.num(dayN), h: U.num(h), n: U.num(nodesN) }),
      nowLine: t('home.walk.now', { d: U.num(dayN), h: U.num(h) }),
      mode: S.mode === 'live' ? t('mode.live') : t('mode.snapshot', { date: snapDate }),
      modeShort: S.mode === 'live' ? t('mode.liveShort') : t('mode.snapshotShort'),
      sourceNote: S.mode === 'live' ? t('foot.live') : t('foot.stale', { date: snapDate, h: U.num(h) })
    };
    return v;
  }
  function bind() {
    var v = values();
    document.documentElement.setAttribute('data-mode', S.mode);
    U.$$('[data-live]').forEach(function (e) {
      var k = e.getAttribute('data-live');
      if (v[k] !== undefined && e.textContent !== v[k]) e.textContent = v[k];
    });
  }
  function publish() { bind(); U.emit('data', S); }

  function start() {
    started = true;
    bind();
    if (!S.tried && !pending) refresh();
    timer = setInterval(function () { if (!document.hidden) refresh(); }, 45000);
    setInterval(function () { if (!document.hidden) bind(); }, 20000);
    // zurück im Vordergrund oder über "Zurück" wieder aufgerufen: nicht bis zum nächsten Takt warten
    function stale() { if (!document.hidden && Date.now() / 1000 - S.at > 60) refresh(); }
    document.addEventListener('visibilitychange', stale);
    window.addEventListener('pageshow', function (e) { if (e.persisted) stale(); });
    U.on('lang', publish);
    U.on('chain', publish);
  }
  return { S: S, prime: prime, start: start, refresh: refresh, get: get, values: values, avgBlockTime: avgBlockTime, ago: ago, now: now, duration: duration, API: API, PUBLIC: PUBLIC };
})();

/* ---- 12-chain.js ---- */
/*
 * Der Verlauf der Kette: Zeit und Merkmale jedes Blocks seit Block 0. Daraus entstehen das Band der Startseite,
 * das Logbuch, die Zeitachsen und die Tageswerte der Netzseite.
 *
 * Grundstock ist assets/data/kette.js (Stand beim letzten Auffrischen, siehe tools/kette.mjs). Die 50 neuesten Blöcke
 * kommen mit jedem Stand der Kette dazu. Liegt dazwischen eine Lücke, liest eine Seite, die den Verlauf zeigt, die
 * fehlenden Blöcke aus der öffentlichen API nach: 50 je Abruf, höchstens MAX_PAGES Abrufe je Seitenaufruf.
 * Gespeichert wird davon im Browser nichts. Je frischer die Datei, desto weniger ist nachzuladen.
 *
 * Solange noch etwas fehlt, tragen diese Blöcke das Merkmal 8 ("Ort geschätzt"): Sie liegen gleichmäßig verteilt
 * zwischen dem letzten bekannten und dem ältesten der 50 neuesten. Tageswerte und Summen rechnen nur mit lückenlos
 * bekannten Blöcken; bis wohin das reicht, sagt exactTip().
 *
 * Je Block:  T[i]  Sekunden seit Block 0
 *            F[i]  Merkmale: Bit 0-1 Finder (0 allein, 1 YSKAR MAIN, 2 Gozero, 3 anderer Pool), 4 trägt Überweisungen, 8 Ort geschätzt
 */
var Chain = (function () {
  'use strict';
  var H = window.YSKAR_SNAPSHOT.history, PAGE = 50, MAX_PAGES = 12, STEP = 24, RECENT = 6;
  var T = [], F = [], n = 0, t0 = H.t0;
  var exact = 0;                 // die Blöcke 0 … exact-1 sind lückenlos bekannt
  var D = {};                    // Difficulty je Block ab H.tail.from (Höhe -> Wert)
  var X = {};                    // Zahl der Überweisungen je Block, nur wo > 0 und nur für nachgeladene Blöcke
  var agg = null, busy = false, pages = 0, version = 0, wanted = false;

  function b64(s) { var bin = atob(s), a = new Uint8Array(bin.length), i; for (i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
  function cls(b) { return b.finder === 'Gozero' ? 2 : b.finder === 'YSKAR MAIN' ? 1 : ((b.recipients || 1) === 1 ? 0 : 3); }

  function load() {
    var dt = b64(H.dt), fl = b64(H.fl), i, t = 0, d;
    for (i = 0; i < H.n; i++) {
      d = dt[2 * i] | (dt[2 * i + 1] << 8); if (d & 0x8000) d -= 0x10000;
      t = i === 1 && H.t1 ? H.t1 - H.t0 : t + d;       // der Abstand von Block 0 zu Block 1 passt nicht in 16 Bit
      T.push(t); F.push(fl[i]);
    }
    n = exact = H.n;
    H.tail.d.forEach(function (v, k) { D[H.tail.from + k] = v; });
  }
  /** Einen Block mit allen Angaben (Antwort der API) an die lückenlose Reihe hängen. */
  function add(b) {
    var h = b.height, x = (b.txCount || 1) - 1, c = cls(b);
    T[h] = Number(b.timestamp) - t0; F[h] = c | (x > 0 ? 4 : 0);
    D[h] = Number(b.difficultyWert);
    if (x > 0) X[h] = x;
    exact = h + 1; if (n < exact) n = exact;
  }

  /** Einen schon bekannten Block durch den ersetzen, den die Kette jetzt an dieser Höhe führt. */
  function again(b) {
    var keep = exact;
    if (X[b.height]) delete X[b.height];
    add(b); exact = keep;
  }

  /* ---- die 50 neuesten Blöcke einarbeiten, Lücke dazwischen vorläufig schätzen ---- */
  function sync() {
    var b = Live.S.blocks, tip = b[0] && b[0].height, lo, i, h, before = n + ':' + exact, from, to, span, changed = false;
    if (typeof tip !== 'number' || tip + 1 < exact) return;
    lo = b[b.length - 1].height;
    if (lo <= exact) {
      // Die jüngsten Blöcke können noch ersetzt worden sein (ein anderer Zweig hat sich durchgesetzt): neu übernehmen
      for (i = b.length - 1; i >= 0; i--) {
        h = b[i].height;
        if (h >= H.n && h < exact && h >= exact - RECENT && (T[h] !== Number(b[i].timestamp) - t0 || D[h] !== Number(b[i].difficultyWert))) { again(b[i]); changed = true; }
      }
      for (i = b.length - 1; i >= 0; i--) if (b[i].height === exact) add(b[i]);
      n = exact;
    } else {
      // Lücke: Blöcke exact … lo-1 fehlen noch. Die neuesten stehen schon an ihrem echten Ort.
      from = T[exact - 1]; to = Number(b[b.length - 1].timestamp) - t0; span = lo - exact + 1;
      for (h = exact; h < lo; h++) { T[h] = from + (to - from) * (h - exact + 1) / span; F[h] = 8; }
      for (i = b.length - 1; i >= 0; i--) { h = b[i].height; T[h] = Number(b[i].timestamp) - t0; F[h] = cls(b[i]) | (b[i].txCount > 1 ? 4 : 0); }
      n = tip + 1; T.length = F.length = n;
      if (wanted) fill();
    }
    if (changed || n + ':' + exact !== before) { agg = null; version++; }
  }
  /** Die Lücke von unten her schließen: je Abruf 50 Blöcke, einer nach dem anderen, höchstens MAX_PAGES je Seitenaufruf. */
  function fill() {
    if (busy || !wanted || Live.S.mode !== 'live' || pages >= MAX_PAGES) return;
    var lo = Live.S.blocks[Live.S.blocks.length - 1].height;
    if (exact >= lo) return;
    busy = true; pages++;
    Live.get('/blocks?limit=' + PAGE + '&before=' + (exact + PAGE), 12000).then(function (r) {
      var list = (r && r.blocks) || [], i, got = 0;
      for (i = list.length - 1; i >= 0; i--) if (list[i].height === exact && list[i].timestamp !== undefined) { add(list[i]); got++; }
      busy = false;
      if (!got) return;                                           // unerwartete Antwort: nicht weiterfragen
      agg = null; version++;
      var lo2 = Live.S.blocks[Live.S.blocks.length - 1].height;
      if (exact >= lo2 || pages >= MAX_PAGES) { sync(); U.emit('chain'); }
      else setTimeout(fill, 120);
    }, function () { busy = false; });
  }

  /* ---- Tageswerte, Difficulty-Reihe, Summen: aus den lückenlos bekannten Blöcken ---- */
  function compute() {
    var days = [], cur = null, i, day, c, work, j, k, sum, cnt, tx = H.transfers, fa = { solo: 0, main: 0, gozero: 0, other: 0 }, f1 = { solo: 0, main: 0, gozero: 0, other: 0 };
    var NAME = ['solo', 'main', 'gozero', 'other'];
    for (i = 1; i < exact; i++) {
      // Tag in UTC. Ein Block darf eine frühere Zeit tragen als sein Vorgänger; er zählt dann zum laufenden Tag.
      day = Math.max(cur ? cur.day : 0, Math.floor((t0 + T[i]) / 86400));
      if (!cur || cur.day !== day) { cur = { day: day, h0: i, h1: i, n: 0, main: 0, gozero: 0, solo: 0, other: 0 }; days.push(cur); }
      c = NAME[F[i] & 3]; cur[c]++; cur.n++; cur.h1 = i; fa[c]++;
      if (i >= exact - 1000) f1[c]++;
    }
    days.forEach(function (d) {
      var span = T[d.h1] - T[d.h0 - 1];
      d.d = new Date(d.day * 86400000).toISOString().slice(0, 10);
      d.bt = Math.round(span / d.n * 10) / 10;
      if (d.h0 >= H.tail.from) { work = 0; for (j = d.h0; j <= d.h1; j++) work += D[j] || 0; }
      else work = H.work[d.day];
      d.hr = span > 0 && work ? Math.round(work * 65536 / span) : null;
    });
    // Difficulty: Mittel je 24 Blöcke; abgeschlossene Abschnitte aus dem Grundstock, der Rest aus den Einzelwerten
    var series = H.series.slice(), start = series.length ? series[series.length - 1][0] + 1 : 1;
    for (k = start; k < exact; k += STEP) {
      sum = 0; cnt = 0;
      for (j = k; j < k + STEP && j < exact; j++) { sum += D[j] || 0; cnt++; }
      if (cnt) series.push([k + cnt - 1, Math.round(sum / cnt)]);
    }
    for (i in X) if (+i < exact) tx += X[i];
    return {
      daily: days, series: series,
      totals: {
        blocks: exact, transfers: tx, finders: fa, finders1000: f1,
        avgBlockTime: exact > 2 ? Math.round((T[exact - 1] - T[1]) / (exact - 2) * 10) / 10 : 600
      }
    };
  }
  function A() { return agg || (agg = compute()); }

  function init() {
    sync();
    U.on('data', sync);
  }
  load();
  return {
    init: init,
    /** Eine Baugruppe zeigt den Verlauf: fehlende Blöcke nachladen (sonst bleibt es bei Grundstock und neuesten Blöcken). */
    want: function () { if (!wanted) { wanted = true; fill(); } },
    get: function () { return { T: T, F: F, n: n, t0: t0, v: version }; },
    daily: function () { return A().daily; }, series: function () { return A().series; }, totals: function () { return A().totals; },
    /** Höhe des letzten Blocks, bis zu dem der Verlauf lückenlos bekannt ist. */
    exactTip: function () { return exact - 1; },
    /** Zeitpunkt eines Blocks (Unix-Sekunden), sofern bekannt und nicht nur geschätzt. */
    timeOf: function (h) { return h >= 0 && h < n && !(F[h] & 8) ? t0 + T[h] : null; }
  };
})();

/* ---- 20-proof.js ---- */
/*
 * Der Blockkopf als Anzeige: 136 Byte, nach Feldern gekennzeichnet, im Browser zweimal gehasht
 * und mit dem Ziel verglichen. Kein Server wird nach dem Ergebnis gefragt.
 *
 *   <div data-proof="tip" data-trace="short" data-legend="chips"></div>
 */
var Proof = (function () {
  'use strict';
  var GENESIS = '010000000000000000000000000000000000000000000000000000000000000000000000000000001007612ea5c27b0b7c6ae79c745da364cfd64224eb6f5519bf559dc3b09fe840e2860175f61cefa97ff34e88d35402a7ee373a8764adbdda0b97ef200bbeca5780a1a06a000000000010000001000000000000000000000024bf060300000000';
  var instances = [];
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fieldValue(id, h) {
    switch (id) {
      case 'version': return String(h.version);
      case 'height': return U.num(h.height);
      case 'prev': return U.shortHash(h.prev, 14, 10);
      case 'merkle': return U.shortHash(h.merkle, 14, 10);
      case 'state': return U.shortHash(h.state, 14, 10);
      case 'time': return U.date(h.time, true);
      case 'diff': return U.num(Number(h.difficulty));
      case 'count': return U.num(h.count);
      case 'extra': return h.extra.toLocaleString(U.loc());
      case 'nonce': return h.nonce.toLocaleString(U.loc());
    }
    return '';
  }

  function Instance(root) {
    this.root = root;
    this.source = root.getAttribute('data-proof') || 'tip';     // tip | genesis | fest (Hex in data-hex)
    this.trace = root.getAttribute('data-trace') || 'short';
    this.legend = root.getAttribute('data-legend') || 'chips';
    this.sel = null; this.hex = null; this.animated = false;
    this.build();
  }
  Instance.prototype.currentHex = function () {
    if (this.source === 'genesis') return GENESIS;
    if (this.source === 'fixed') return this.root.getAttribute('data-hex');
    var b = Live.S.blocks[0];
    return b && b.header ? b.header : GENESIS;
  };
  Instance.prototype.build = function () {
    var r = this.root, self = this;
    r.classList.add('proof');
    r.innerHTML =
      '<div class="display-head"><div class="proof-id"><span class="display-title" data-p="title"></span><span class="proof-age" data-p="age"></span></div>' +
      '<span class="state" data-p="state"></span></div>' +
      '<div class="proof-body"><div class="proof-a">' +
      '<p class="proof-cap" data-p="cap"></p>' +
      '<div class="bytes" data-p="bytes" role="img"></div>' +
      '<div class="legend" data-p="legend"></div>' +
      '</div><div class="proof-b">' +
      '<div class="proof-read" data-p="read" aria-live="polite"></div>' +
      '<div class="proof-result"><div class="trace" data-p="trace"></div>' +
      '<p class="verdict" data-p="verdict" role="status"></p>' +
      '<div class="row proof-actions"><button type="button" class="btn small" data-p="again"></button>' +
      '<button type="button" class="btn small ghost" data-p="swap"></button></div>' +
      '<a class="small proof-open" data-p="open"></a></div>' +
      '</div></div>';
    this.p = {};
    U.$$('[data-p]', r).forEach(function (e) { self.p[e.getAttribute('data-p')] = e; });
    // data-plain: nur dieser eine Block (Explorer) – kein Wechsel zu Block 0, kein Verweis auf sich selbst
    if (r.hasAttribute('data-plain')) { this.p.swap.hidden = true; this.p.open.hidden = true; }
    this.p.again.addEventListener('click', function () { self.render(true); });
    this.p.swap.addEventListener('click', function () {
      self.source = self.source === 'genesis' ? 'tip' : 'genesis';
      self.sel = null; self.render(true);
    });
    this.p.bytes.addEventListener('pointerover', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(c.getAttribute('data-f'), true);
    });
    this.p.bytes.addEventListener('click', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(c.getAttribute('data-f'));
    });
    this.p.legend.addEventListener('click', function (e) {
      var c = e.target.closest('[data-f]'); if (c) self.select(self.sel === c.getAttribute('data-f') ? null : c.getAttribute('data-f'));
    });
  };
  Instance.prototype.select = function (id, soft) {
    if (soft && this.sel === id) return;
    this.sel = id;
    if (id) this.p.bytes.setAttribute('data-sel', id); else this.p.bytes.removeAttribute('data-sel');
    U.$$('[data-f]', this.p.legend).forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-f') === id ? 'true' : 'false'); });
    this.readout();
  };
  Instance.prototype.readout = function () {
    var box = this.p.read, id = this.sel, h = this.res.header;
    box.textContent = '';
    if (!id) { box.appendChild(U.el('p', { class: 'proof-hint', text: t('proof.pick').replace(/<[^>]+>/g, '') })); return; }
    var f = U.FIELDS.filter(function (x) { return x.id === id; })[0];
    box.appendChild(U.el('p', { class: 'proof-field' }, [
      U.el('span', { class: 'sw f-' + id }), U.el('strong', { text: t('field.' + id) }),
      U.el('span', { class: 'mono', text: fieldValue(id, h) }),
      U.el('span', { class: 'proof-range', text: t('proof.range', { a: f.off, b: f.off + f.len - 1 }) })
    ]));
    box.appendChild(U.el('p', { class: 'proof-desc', text: t('field.' + id + '.d').replace(/<[^>]+>/g, '') }));
  };
  Instance.prototype.render = function (animate) {
    var hex = this.currentHex(), self = this, p = this.p;
    this.hex = hex;
    var res = this.res = U.verifyHeader(hex), h = res.header, isTip = this.source === 'tip';
    var tip = Live.S.blocks[0];

    p.title.textContent = t('proof.block', { h: U.num(h.height) });
    p.age.textContent = isTip && tip ? t('proof.found', { ago: Live.ago(Number(tip.timestamp), Live.now()) }) : U.date(h.time, true);
    p.state.textContent = isTip ? Live.values().modeShort : this.source === 'genesis' ? t('proof.fixed') : t('proof.fixedBlock');
    p.state.classList.toggle('fixed', !isTip);
    p.cap.textContent = t('proof.cap');
    p.bytes.setAttribute('aria-label', t('proof.bytesLabel', { h: U.num(h.height) }));

    // 136 Byte
    var frag = document.createDocumentFragment();
    U.FIELDS.forEach(function (f) {
      for (var i = 0; i < f.len; i++) {
        var b = h.bytes[f.off + i];
        frag.appendChild(U.el('span', { class: 'b f-' + f.id + (i === f.len - 1 ? ' end' : ''), 'data-f': f.id, text: (b < 16 ? '0' : '') + b.toString(16) }));
      }
    });
    p.bytes.textContent = ''; p.bytes.appendChild(frag);
    if (this.sel) p.bytes.setAttribute('data-sel', this.sel); else p.bytes.removeAttribute('data-sel');

    // Legende
    p.legend.textContent = '';
    p.legend.className = 'legend ' + this.legend;
    U.FIELDS.forEach(function (f) {
      var kids = [U.el('span', { class: 'sw f-' + f.id }), U.el('span', { class: 'nm', text: t('field.' + f.id) })];
      if (self.legend === 'table') {
        kids.push(U.el('span', { class: 'rg mono', text: f.off + '–' + (f.off + f.len - 1) }));
        kids.push(U.el('span', { class: 'vl mono', text: fieldValue(f.id, h) }));
      }
      p.legend.appendChild(U.el('button', { type: 'button', 'data-f': f.id, 'aria-pressed': self.sel === f.id ? 'true' : 'false' }, kids));
    });
    this.readout();

    // Rechenweg
    p.trace.textContent = '';
    if (this.trace === 'full') p.trace.appendChild(line(t('proof.first'), res.first, null));
    var cmp = compare(res.hash, res.target);
    p.trace.appendChild(line(t('proof.hash'), res.hash, cmp, 'hash'));
    p.trace.appendChild(line(t('proof.target', { d: U.num(Number(h.difficulty)) }), res.target, cmp, 'target'));

    p.verdict.className = 'verdict ' + (res.valid ? 'ok' : 'bad');
    p.verdict.textContent = (res.valid ? t('proof.valid') : t('proof.invalid')) + ' ' +
      t('proof.time', { ms: U.num(Math.max(res.ms, 0.01), res.ms < 10 ? 2 : 0) });
    p.again.textContent = t('proof.again');
    p.swap.textContent = this.source === 'genesis' ? t('proof.latest') : t('proof.genesis');
    p.open.textContent = t('proof.open');
    p.open.setAttribute('href', Router.href('#explorer-block-' + h.height));

    if (animate && !reduce) this.play();
  };
  /** Stelle, an der Hash und Ziel sich zum ersten Mal unterscheiden. */
  function compare(hash, target) {
    var i = 0;
    while (i < 64 && hash[i] === target[i]) i++;
    return i;
  }
  function line(label, hex, cmp, kind) {
    var code = U.el('code', { class: 'hexline' });
    if (cmp === null || cmp === undefined || cmp >= 64) code.textContent = hex;
    else {
      code.appendChild(U.el('span', { class: 'same', text: hex.slice(0, cmp) }));
      code.appendChild(U.el('span', { class: 'pivot ' + kind, text: hex[cmp] }));
      code.appendChild(U.el('span', { class: 'rest', text: hex.slice(cmp + 1) }));
    }
    return U.el('div', { class: 'tline' }, [U.el('span', { class: 'k', text: label.replace(/<[^>]+>/g, '') }), code]);
  }
  /** Ein Durchlauf: die Felder leuchten der Reihe nach auf, dann steht das Urteil. */
  Instance.prototype.play = function () {
    var cells = U.$$('.b', this.p.bytes), self = this, i = 0, n = cells.length, step = 4;
    this.root.classList.add('running');
    (function tick() {
      for (var k = 0; k < step && i < n; k++, i++) cells[i].classList.add('lit');
      if (i < n) return void requestAnimationFrame(tick);
      setTimeout(function () {
        cells.forEach(function (c) { c.classList.remove('lit'); });
        self.root.classList.remove('running');
      }, 220);
    })();
  };

  function init() {
    U.$$('[data-proof]').forEach(function (root) { instances.push(new Instance(root)); });
    instances.forEach(function (x, idx) { x.render(idx === 0); });
    var lastTip = Live.S.blocks[0] && Live.S.blocks[0].hash, lastMode = Live.S.mode;
    U.on('data', function () {
      var tip = Live.S.blocks[0] && Live.S.blocks[0].hash, fresh = tip !== lastTip, mode = Live.S.mode;
      instances.forEach(function (x) {
        if (x.source !== 'tip') { if (mode !== lastMode) x.render(false); return; }
        x.render(fresh && !x.root.closest('[hidden]'));
      });
      lastTip = tip; lastMode = mode;
    });
  }
  function mount(root, animate) { var x = new Instance(root); instances.push(x); x.render(!!animate); return x; }
  function unmount(x) { var i = instances.indexOf(x); if (i >= 0) instances.splice(i, 1); }
  return { init: init, GENESIS: GENESIS, mount: mount, unmount: unmount };
})();

/* ---- 23-charts.js ---- */
/*
 * Diagramme ohne Bibliothek: Linie mit Fläche, Säulen, gestapelte Säulen.
 * Regeln: eine Achse, dünne Marken, zurückhaltendes Raster, Fadenkreuz mit Ablesung,
 * jede Zahl auch als Tabelle. Farben der Reihen sind für die schwarze Anzeige geprüft.
 */
var Charts = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', registry = [];

  function s(tag, attrs, kids) {
    var e = document.createElementNS(NS, tag), k;
    for (k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
    (kids || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function txt(x, y, str, cls, anchor) {
    var e = s('text', { x: x, y: y, class: cls || 'c-tick', 'text-anchor': anchor || 'start' });
    e.textContent = str; return e;
  }
  /** Runde Achsenwerte: höchstens n Schritte bis über max. */
  function niceTicks(max, n) {
    if (!(max > 0)) return [0, 1];
    var raw = max / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
    var step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag, out = [], v;
    for (v = 0; v < max + step * 0.999; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function logTicks(min, max) {
    var out = [], e;
    for (e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) out.push(Math.pow(10, e));
    return out;
  }
  function frame(root, o) {
    var W = Math.max(root.clientWidth, 260), H = o.height || (W < 480 ? 210 : 250);
    var m = { l: o.left || 52, r: 14, t: o.key ? 32 : 14, b: 26 };
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': o.label || '', tabindex: '0', class: 'chart-svg' });
    root.textContent = ''; root.appendChild(svg);
    return { svg: svg, W: W, H: H, m: m, pw: W - m.l - m.r, ph: H - m.t - m.b };
  }
  function tipNode(head, rows) {
    var box = U.el('div', {}, [U.el('div', { class: 'th', text: head })]);
    rows.forEach(function (r) {
      var kids = [];
      if (r.color) kids.push(U.el('span', { class: 'key', style: 'background:' + r.color }));
      kids.push(U.el('b', { text: r.value }));
      if (r.name) kids.push(U.el('span', { text: r.name }));
      box.appendChild(U.el('div', { class: 'tr' }, kids));
    });
    return box;
  }
  /** Fadenkreuz: rastet auf die nächste Datenstelle ein; Pfeiltasten bewegen es. */
  function crosshair(f, n, xOf, onPick, light) {
    var line = s('line', { x1: 0, x2: 0, y1: f.m.t, y2: f.m.t + f.ph, class: 'c-cross' + (light ? ' light' : ''), visibility: 'hidden' });
    f.svg.appendChild(line);
    var cur = -1;
    function pick(i, ev) {
      i = Math.max(0, Math.min(n - 1, i)); cur = i;
      var x = xOf(i); line.setAttribute('x1', x); line.setAttribute('x2', x); line.setAttribute('visibility', 'visible');
      var r = f.svg.getBoundingClientRect();
      var node = onPick(i);
      U.tipShow(node, ev ? ev.clientX : r.left + x * (r.width / f.W), ev ? ev.clientY : r.top + f.m.t + 10);
    }
    function nearest(ev) {
      var r = f.svg.getBoundingClientRect(), x = (ev.clientX - r.left) * (f.W / r.width), best = 0, bd = Infinity, i, d;
      for (i = 0; i < n; i++) { d = Math.abs(xOf(i) - x); if (d < bd) { bd = d; best = i; } }
      return best;
    }
    function hide() { line.setAttribute('visibility', 'hidden'); U.tipHide(); cur = -1; }
    f.svg.addEventListener('pointermove', function (ev) { pick(nearest(ev), ev); });
    f.svg.addEventListener('pointerdown', function (ev) { pick(nearest(ev), ev); });
    f.svg.addEventListener('pointerleave', hide);
    f.svg.addEventListener('blur', hide);
    f.svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') { ev.preventDefault(); pick(cur < 0 ? n - 1 : cur + (ev.key === 'ArrowRight' ? 1 : -1)); }
      else if (ev.key === 'Escape') hide();
    });
  }
  function yAxis(f, ticks, yOf, fmt, light) {
    ticks.forEach(function (v) {
      var y = yOf(v);
      if (y < f.m.t - 1 || y > f.m.t + f.ph + 1) return;
      f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + f.pw, y1: y, y2: y, class: 'c-grid' + (light ? ' light' : '') }));
      f.svg.appendChild(txt(f.m.l - 8, y + 4, fmt(v), 'c-tick' + (light ? ' light' : ''), 'end'));
    });
  }
  function xLabels(f, n, xOf, labelOf, light) {
    var want = f.W < 480 ? 3 : 5, step = Math.max(1, Math.round((n - 1) / (want - 1))), i, used = {};
    for (i = 0; i < n; i += step) used[i] = 1;
    used[n - 1] = 1;
    Object.keys(used).forEach(function (k) {
      var i = +k;
      if (i !== n - 1 && n - 1 - i < step * 0.6) return;     // letzte Beschriftung nicht überlagern
      var a = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      f.svg.appendChild(txt(xOf(i), f.H - 7, labelOf(i), 'c-tick' + (light ? ' light' : ''), a));
    });
  }

  /** Bezugslinie: gestrichelt über die Fläche, benannt in einer Zeile über dem Diagramm (kollidiert mit nichts). */
  function refLine(f, y, label, light) {
    f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + f.pw, y1: y, y2: y, class: 'c-ref' + (light ? ' light' : '') }));
    f.svg.appendChild(s('line', { x1: f.m.l, x2: f.m.l + 20, y1: 10, y2: 10, class: 'c-ref' + (light ? ' light' : '') }));
    f.svg.appendChild(txt(f.m.l + 27, 14, label, 'c-reflabel' + (light ? ' light' : ''), 'start'));
  }

  /* ---- Linie mit Fläche ---- */
  function line(root, o) {
    o.key = !!(o.refs && o.refs.length);
    var f = frame(root, o), pts = o.points, n = pts.length;
    if (!n) return;
    var ys = pts.map(function (p) { return p.y; }), max = Math.max.apply(null, ys.concat(o.refs ? o.refs.map(function (r) { return r.y; }) : [])), min = Math.min.apply(null, ys);
    var ticks, yOf;
    if (o.log) {
      ticks = logTicks(Math.max(min, 1), max);
      var lo = Math.log10(ticks[0]), hi = Math.log10(ticks[ticks.length - 1]);
      yOf = function (v) { return f.m.t + f.ph - (Math.log10(Math.max(v, ticks[0])) - lo) / (hi - lo) * f.ph; };
    } else {
      ticks = o.ticks || niceTicks(max, 4);
      var top = ticks[ticks.length - 1];
      yOf = function (v) { return f.m.t + f.ph - v / top * f.ph; };
    }
    var xOf = function (i) { return f.m.l + (n === 1 ? f.pw / 2 : i / (n - 1) * f.pw); };
    yAxis(f, ticks, yOf, o.yFmt, o.light);
    xLabels(f, n, xOf, function (i) { return pts[i].label; }, o.light);
    (o.refs || []).forEach(function (r) { refLine(f, yOf(r.y), r.label, o.light); });
    var d = '', i;
    for (i = 0; i < n; i++) d += (i ? 'L' : 'M') + xOf(i).toFixed(1) + ' ' + yOf(pts[i].y).toFixed(1);
    var base = f.m.t + f.ph;
    f.svg.appendChild(s('path', { d: d + 'L' + xOf(n - 1).toFixed(1) + ' ' + base + 'L' + xOf(0).toFixed(1) + ' ' + base + 'Z', fill: o.color, 'fill-opacity': o.light ? 0.13 : 0.12, stroke: 'none' }));
    f.svg.appendChild(s('path', { d: d, fill: 'none', stroke: o.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    (o.marks || []).forEach(function (mk) {
      if (mk.i < 0 || mk.i >= n) return;
      f.svg.appendChild(s('circle', { cx: xOf(mk.i), cy: yOf(pts[mk.i].y), r: 5, fill: mk.color || o.color, stroke: o.surface || '#000', 'stroke-width': 2 }));
      if (mk.label) f.svg.appendChild(txt(xOf(mk.i) + (mk.i > n * 0.8 ? -10 : 10), yOf(pts[mk.i].y) + (mk.dy === undefined ? -9 : mk.dy), mk.label, 'c-label' + (o.light ? ' light' : ''), mk.i > n * 0.8 ? 'end' : 'start'));
    });
    crosshair(f, n, xOf, function (i) { return tipNode(pts[i].tip || pts[i].label, [{ value: o.yFmt(pts[i].y, true), color: o.color, name: o.name }]); }, o.light);
    return { xOf: xOf, yOf: yOf, frame: f };
  }

  /* ---- Säulen (eine Reihe oder gestapelt) ---- */
  function bars(root, o) {
    o.key = !!o.ref;
    var f = frame(root, o), items = o.items, n = items.length, series = o.series;
    if (!n) return;
    var totals = items.map(function (it) { return series.reduce(function (a, se) { return a + (it[se.key] || 0); }, 0); });
    var max = Math.max.apply(null, totals.concat(o.ref ? [o.ref.value] : []));
    var ticks = niceTicks(max, 4), top = ticks[ticks.length - 1];
    var yOf = function (v) { return f.m.t + f.ph - v / top * f.ph; };
    var band = f.pw / n, bw = Math.max(2, Math.min(24, band - 2));
    var xOf = function (i) { return f.m.l + band * (i + 0.5); };
    yAxis(f, ticks, yOf, o.yFmt, false);
    xLabels(f, n, xOf, function (i) { return items[i].label; }, false);
    items.forEach(function (it, i) {
      var y = f.m.t + f.ph, x = xOf(i) - bw / 2, live = series.filter(function (se) { return (it[se.key] || 0) > 0; });
      live.forEach(function (se, k) {
        var h = (it[se.key] || 0) / top * f.ph, gap = k < live.length - 1 ? 2 : 0, hh = Math.max(h - gap, 0.5), isTop = k === live.length - 1;
        y -= h;
        var r = isTop ? Math.min(3, bw / 2, hh) : 0;
        // oben abgerundet, an der Grundlinie eckig
        var d = 'M' + x + ' ' + (y + gap + hh) + 'V' + (y + gap + r) + 'Q' + x + ' ' + (y + gap) + ' ' + (x + r) + ' ' + (y + gap) +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + (y + gap) + ' ' + (x + bw) + ' ' + (y + gap + r) + 'V' + (y + gap + hh) + 'Z';
        f.svg.appendChild(s('path', { d: d, fill: se.color }));
      });
    });
    if (o.ref) refLine(f, yOf(o.ref.value), o.ref.label, false);
    crosshair(f, n, xOf, function (i) {
      var rows = series.map(function (se) { return { value: o.yFmt(items[i][se.key] || 0, true), color: se.color, name: series.length > 1 ? se.name : (o.name || '') }; });
      if (series.length > 1) rows.push({ value: o.yFmt(totals[i], true), name: t('chart.total') });
      return tipNode(items[i].tip || items[i].label, rows);
    }, false);
  }

  /** Tabelle mit denselben Werten wie das Diagramm. */
  function table(root, head, rows) {
    var tb = U.el('table', { class: 'tbl' }), tr = U.el('tr');
    head.forEach(function (h, i) { tr.appendChild(U.el('th', { text: h, class: i ? 'n' : '' })); });
    tb.appendChild(U.el('thead', {}, [tr]));
    var body = U.el('tbody');
    rows.forEach(function (r) {
      var row = U.el('tr');
      r.forEach(function (c, i) { row.appendChild(U.el('td', { text: c, class: i ? 'n' : '' })); });
      body.appendChild(row);
    });
    tb.appendChild(body);
    root.textContent = ''; root.appendChild(U.el('div', { class: 'tbl-scroll' }, [tb]));
  }

  /** Meldet ein Diagramm an: gezeichnet wird, sobald es sichtbar ist, und neu bei Daten, Sprache, Größe. */
  function register(root, draw) {
    var item = { root: root, draw: draw, w: -1 };
    registry.push(item); return item;
  }
  function refresh(force) {
    registry.forEach(function (it) {
      var w = it.root.clientWidth;
      if (!w) return;                                   // Seite gerade nicht sichtbar
      if (force || w !== it.w) { it.w = w; try { it.draw(it.root); } catch (e) { if (window.console) console.error(e); } }
    });
  }
  function init() {
    var to = null;
    window.addEventListener('resize', function () { clearTimeout(to); to = setTimeout(function () { refresh(false); }, 120); });
    U.on('route', function () { requestAnimationFrame(function () { refresh(false); }); });
    U.on('data', function () { refresh(true); });
    U.on('tab', function () { requestAnimationFrame(function () { refresh(false); }); });
    refresh(true);
  }
  return { init: init, line: line, bars: bars, table: table, register: register, refresh: refresh };
})();

/* ---- 25-miner.js ---- */
/*
 * Mining-Demo: Der Browser sucht auf dem echten Kopf des neuesten Blocks nach einer Nonce,
 * gegen ein leichteres Ziel (der Hash muss mit n Null-Bits beginnen). Danach steht da,
 * wie lange derselbe Browser im Mittel für einen echten Block bräuchte.
 */
var Miner = (function () {
  'use strict';
  var running = false, stop = false, lastRate = 0, lastState = null;
  var CAP = 60000000;

  function $(id) { return document.getElementById(id); }
  function bits() { return +$('miner-bits').value; }
  function targetHex(b) {
    var one = (BigInt(1) << BigInt(256 - b)) - BigInt(1), s = one.toString(16);
    while (s.length < 64) s = '0' + s;
    return s;
  }
  function targetWords(hex) {
    var w = new Int32Array(8), i;
    for (i = 0; i < 8; i++) w[i] = parseInt(hex.substr(i * 8, 8), 16) | 0;
    return w;
  }
  function duration(sec) {
    if (!isFinite(sec)) return '—';
    var n;
    if (sec < 120) { n = Math.max(1, Math.round(sec)); return tn('dur.sec', n, { n: U.num(n) }); }
    if (sec < 7200) { n = Math.round(sec / 60); return tn('dur.min', n, { n: U.num(n) }); }
    if (sec < 172800) { n = Math.round(sec / 3600); return tn('dur.hours', n, { n: U.num(n) }); }
    if (sec < 730 * 86400) { n = Math.round(sec / 86400); return tn('dur.days', n, { n: U.num(n) }); }
    var y = sec / (365.25 * 86400);
    if (y >= 1e6) return t('dur.years.big', { n: U.compact(y, 1) });
    n = y < 10 ? Math.round(y * 10) / 10 : Math.round(y);
    return tn('dur.years', n, { n: U.num(n, 1) });
  }
  function hashWithNonce(header, n) {
    var b = new Uint8Array(header), lo = n >>> 0, hi = Math.floor(n / 4294967296) >>> 0;
    b[128] = lo & 255; b[129] = (lo >>> 8) & 255; b[130] = (lo >>> 16) & 255; b[131] = lo >>> 24;
    b[132] = hi & 255; b[133] = (hi >>> 8) & 255; b[134] = (hi >>> 16) & 255; b[135] = hi >>> 24;
    return U.bytesToHex(Sha.twice(b));
  }
  function showHash(hex, found, b) {
    var code = $('miner-hash'); code.textContent = '';
    if (!hex) { code.textContent = '—'; return; }
    var zeros = 0;
    while (zeros < 64 && hex[zeros] === '0') zeros++;
    code.appendChild(U.el('span', { class: found ? 'zeros ok' : 'same', text: hex.slice(0, zeros) }));
    code.appendChild(U.el('span', { class: 'rest', text: hex.slice(zeros) }));
    $('miner-hash-k').textContent = found ? t('miner.hashFound') : t('miner.hash');
  }
  function paintIdle() {
    var b = bits();
    $('miner-odds').textContent = t('miner.odds', { b: b, n: U.num(Math.pow(2, b)) });
    $('miner-target').textContent = targetHex(b);
    $('miner-go').textContent = running ? t('miner.stop') : t('miner.start');
    real();
  }
  function real() {
    var box = $('miner-real');
    if (!lastRate) { box.textContent = ''; return; }
    var diff = Number(Live.S.summary.difficultyWert || Live.S.summary.difficulty);
    box.textContent = t('miner.real', { r: U.hashrate(lastRate), t: duration(diff * 65536 / lastRate) });
  }
  function verdict(kind, n) {
    var v = $('miner-verdict');
    lastState = kind ? { kind: kind, n: n } : null;
    if (!kind) { v.textContent = ''; v.className = 'verdict'; return; }
    v.className = 'verdict ' + (kind === 'found' ? 'ok' : 'idle');
    v.textContent = t('miner.' + kind, { n: U.num(n) });
  }
  function run() {
    var tip = Live.S.blocks[0]; if (!tip || !tip.header) return;
    var header = U.hexToBytes(tip.header), search = Sha.makeSearch(header), b = bits(), thex = targetHex(b), target = targetWords(thex);
    var start = Math.floor(Math.random() * 4000000000), next = start, tried = 0, chunk = 4000;
    var clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now, t0 = clock();
    running = true; stop = false; verdict(null); paintIdle();
    $('miner-bits').disabled = true; $('miner-nonce').textContent = '—';
    (function step() {
      var c0 = clock(), r = search(next, chunk, target), dt = clock() - c0;
      tried += r.tried; next += chunk;
      var el = (clock() - t0) / 1000;
      lastRate = tried / Math.max(el, 0.001);
      $('miner-n').textContent = U.num(tried);
      $('miner-rate').textContent = U.hashrate(lastRate);
      $('miner-time').textContent = U.num(el, 1, 1) + ' s';
      if (r.nonce >= 0) {
        showHash(hashWithNonce(header, r.nonce), true, b);
        $('miner-nonce').textContent = r.nonce.toLocaleString(U.loc());
        return done('found', tried);
      }
      showHash(hashWithNonce(header, next - 1), false, b);
      if (stop) return done('stopped', tried);
      if (tried >= CAP) return done('none', tried);
      if (dt < 24) chunk = Math.min(chunk * 2, 400000); else if (dt > 60) chunk = Math.max(2000, Math.floor(chunk / 2));
      setTimeout(step, 0);
    })();
    function done(kind, n) {
      running = false; $('miner-bits').disabled = false;
      verdict(kind, n); paintIdle();
    }
  }
  function init() {
    if (!$('miner')) return;
    $('miner-go').addEventListener('click', function () { if (running) stop = true; else run(); });
    $('miner-bits').addEventListener('input', paintIdle);
    U.on('lang', function () { paintIdle(); if (lastState) verdict(lastState.kind, lastState.n); });
    U.on('data', real);
    U.on('route', function (r) { if (r.page !== 'chain' && running) stop = true; });
    paintIdle();
  }
  return { init: init };
})();

/* ---- 26-tech.js ---- */
/* Technikseite: Difficulty-Verlauf und der Stand der Konsensfassungen. */
var Tech = (function () {
  'use strict';
  var BLUE = '#2F7BFF';

  function short(v) {
    try { return new Intl.NumberFormat(U.loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return U.num(v); }
  }
  function drawDifficulty(root) {
    var ser = Chain.series(), pts = ser.map(function (p) {
      return { y: p[1], label: U.num(p[0]), tip: t('chart.height') + ' ' + U.num(p[0]) };
    });
    Charts.line(root, {
      points: pts, log: true, color: BLUE, left: 62, name: t('field.diff'),
      label: t('tech.diff.chart'),
      yFmt: function (v, full) { return full ? U.num(v) : short(v); },
      marks: [{ i: pts.length - 1 }]
    });
    var rows = [], step = Math.max(1, Math.floor(ser.length / 14)), i;
    for (i = 0; i < ser.length; i += step) rows.push([U.num(ser[i][0]), U.num(ser[i][1])]);
    if ((ser.length - 1) % step) rows.push([U.num(ser[ser.length - 1][0]), U.num(ser[ser.length - 1][1])]);
    Charts.table(document.getElementById('table-difficulty'), [t('chart.height'), t('field.diff')], rows);
  }
  function revisions() {
    var tip = Live.S.summary.height;
    U.$$('[data-rev]').forEach(function (cell) {
      var h = +cell.getAttribute('data-rev');
      var at = h <= tip ? Chain.timeOf(h) : null;
      cell.textContent = h <= tip ? (at ? t('rev.active', { date: U.date(at) }) : t('ms.done')) : t('rev.set', { n: U.num(h - tip) });
      cell.parentNode.classList.toggle('now', h > tip);
    });
  }
  function init() {
    var root = document.getElementById('chart-difficulty');
    if (root) { Chain.want(); Charts.register(root, drawDifficulty); }
    revisions(); U.on('data', revisions);
  }
  return { init: init };
})();

/* ---- 27-ysr.js ---- */
/* Seite „YSR und Menge“: Mengenbalken, Ausgabe nach Blockhöhe (aus der Belohnungsregel berechnet), Tabelle der Ären. */
var Ysr = (function () {
  'use strict';
  var DEEP = '#1B4FD1', MAXH = 96000, STEP = 500, chart = null, showAll = false, sel = null;

  function supplyBar() {
    var root = document.getElementById('supplybar'); if (!root) return;
    var sp = Live.S.supply, max = parseFloat(sp.max), circ = parseFloat(sp.circulating), burned = parseFloat(sp.unspendable);
    var parts = [
      { key: 'circ', v: circ, color: '#3987E5', ink: '#000' },
      { key: 'burned', v: burned, color: '#D95926', ink: '#000' },
      { key: 'open', v: max - circ - burned, color: '#2A2E35', ink: '#EEF1F5' }];
    root.textContent = '';
    var names = [];
    parts.forEach(function (p) {
      var share = p.v / max * 100, seg = U.el('span', { style: 'flex:' + p.v + ' 0 0;background:' + p.color + ';color:' + p.ink });
      if (share >= 9) seg.textContent = U.num(share, 1, 1) + ' %';
      root.appendChild(seg);
      names.push(t('ysr.bar.' + p.key) + ' ' + U.num(share, 1, 1) + ' %');
    });
    root.setAttribute('aria-label', names.join(', '));
    var lg = document.getElementById('supplybar-legend'); lg.textContent = '';
    parts.forEach(function (p) {
      lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + p.color }), t('ysr.bar.' + p.key) + ' ', U.el('b', { class: 'mono', text: U.num(p.v, 0) + ' YSR' })]));
    });
  }

  function drawEmission(root) {
    var pts = [], h, tip = Live.S.summary.height;
    for (h = 0; h <= MAXH; h += STEP) pts.push({ y: U.mintedAt(h) / U.UNIT, label: U.num(h), tip: t('chart.height') + ' ' + U.num(h) });
    var marks = [{ i: Math.round(Math.min(tip, MAXH) / STEP), label: t('ysr.t.now'), color: '#14161A', dy: 17 }];
    if (sel !== null && Math.abs(sel - tip) > STEP) marks.push({ i: Math.round(sel / STEP), color: DEEP });
    Charts.line(root, {
      points: pts, color: DEEP, light: true, surface: '#D5D8DC', left: 54, name: t('ysr.sched.series'), label: t('ysr.sched.title'),
      ticks: [0, 7e6, 14e6, 21e6],
      yFmt: function (v, full) { return full ? U.num(v, 0) + ' YSR' : (v === 0 ? '0' : U.num(v / 1e6, 0) + ' M'); },
      marks: marks
    });
  }
  function read() {
    var tip = Live.S.summary.height, h = sel === null ? tip : sel, era = Math.floor(h / U.EPOCH), minted = U.mintedAt(h);
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('em-height', U.num(h));
    set('em-era', U.num(era + 1) + ' (' + U.num(era * U.EPOCH) + '–' + U.num((era + 1) * U.EPOCH - 1) + ')');
    set('em-reward', U.ysr(U.rewardAt(h)));
    set('em-issued', U.ysr(minted, { max: 2 }));
    set('em-share', U.num(minted / (21000000 * U.UNIT) * 100, 2, 2) + ' %');
    var tipTime = Number(Live.S.blocks[0].timestamp);
    set('em-when', h <= tip ? t('ysr.sched.when.past') : t('ysr.sched.when.future', { date: U.date(tipTime + (h - tip) * 600) }));
  }
  function eraTable() {
    var body = U.$('#era-table tbody'); if (!body) return;
    var tip = Live.S.summary.height, cur = Math.floor(tip / U.EPOCH), n = showAll ? 37 : 8, k;
    body.textContent = '';
    for (k = 0; k < n; k++) {
      var reward = U.rewardAt(k * U.EPOCH), tr = U.el('tr', { class: k === cur ? 'now' : '' }, [
        U.el('td', {}, [U.el('span', { class: 'mono', text: String(k + 1) }), k === cur ? U.el('span', { class: 'nowtag', text: ' ' + t('ysr.t.now') }) : null]),
        U.el('td', { class: 'n', text: U.num(k * U.EPOCH) + '–' + U.num((k + 1) * U.EPOCH - 1) }),
        U.el('td', { class: 'n', text: U.ysr(reward, { bare: true }) }),
        U.el('td', { class: 'n', text: U.ysr(reward * U.EPOCH, { bare: true, max: 4 }) }),
        U.el('td', { class: 'n', text: U.ysr(U.mintedAt((k + 1) * U.EPOCH - 1), { bare: true, max: 4 }) })]);
      body.appendChild(tr);
    }
    var btn = document.getElementById('era-toggle');
    btn.textContent = showAll ? t('ysr.t.less') : t('ysr.t.all');
    btn.setAttribute('aria-expanded', showAll ? 'true' : 'false');
  }
  function all() { supplyBar(); read(); eraTable(); }
  function init() {
    var root = document.getElementById('chart-emission'); if (!root) return;
    chart = Charts.register(root, drawEmission);
    var slider = document.getElementById('emission-h');
    slider.value = Math.round(Live.S.summary.height / 100) * 100;
    slider.addEventListener('input', function () {
      sel = +slider.value; read();
      if (chart.root.clientWidth) chart.draw(chart.root);
    });
    document.getElementById('era-toggle').addEventListener('click', function () { showAll = !showAll; eraTable(); });
    all(); U.on('data', all);
  }
  return { init: init };
})();

/* ---- 28-mining.js ---- */
/* Mining-Seite: Rechner (Schätzung aus der Arbeit der letzten Blöcke) und die Pool-Tabelle. */
var Mining = (function () {
  'use strict';
  var UNITS = { 'H/s': 1, 'kH/s': 1e3, 'MH/s': 1e6, 'GH/s': 1e9, 'TH/s': 1e12 }, mode = 'pool', PER_DAY = 144;

  function $(id) { return document.getElementById(id); }
  /** Netz-Hashrate und Finder aus den neuesten Blöcken der Kette. */
  function basis() {
    var b = Live.S.blocks.slice(0, 50), n = b.length, work = 0, i, finds = {};
    for (i = 0; i < n - 1; i++) work += Number(b[i].difficultyWert || b[i].difficulty);
    var span = Number(b[0].timestamp) - Number(b[n - 1].timestamp);
    b.forEach(function (x) { var f = x.finder || ''; finds[f] = (finds[f] || 0) + 1; });
    return { n: n, net: span > 0 ? work * 65536 / span : 0, finds: finds, height: b[0].height };
  }
  function every(days) {
    if (!isFinite(days)) return '—';
    var sec = days * 86400, y = days / 365.25, n;
    function shown(x, digits) { var f = Math.pow(10, digits); return Math.round(x * f) / f; }
    if (sec < 7200) { n = Math.max(1, Math.round(sec / 60)); return tn('calc.every.min', n, { n: U.num(n) }); }
    if (sec < 172800) { n = shown(sec / 3600, 1); return tn('calc.every.hours', n, { n: U.num(n, 1) }); }
    if (days < 730) { n = shown(days, days < 10 ? 1 : 0); return tn('calc.every.days', n, { n: U.num(n, 1) }); }
    n = shown(y, y < 10 ? 1 : 0);
    return tn('calc.every.years', n, { n: U.num(n, 1) });
  }
  function amount(x) {
    var max = x >= 100 ? 0 : x >= 1 ? 2 : x >= 0.01 ? 4 : 8;
    return U.num(x, max) + ' YSR';
  }
  function poolList() {
    var sel = $('calc-pool'), old = sel.value, B = basis();
    var pools = (Live.S.pools.pools || []).slice().sort(function (a, b) { return (B.finds[b.kette || b.name] || 0) - (B.finds[a.kette || a.name] || 0); });
    sel.textContent = '';
    pools.forEach(function (p) {
      var o = U.el('option', { value: p.host, text: p.name + ', ' + U.num(p.feeBps / 100, 2) + ' %' });
      sel.appendChild(o);
    });
    if (old && pools.some(function (p) { return p.host === old; })) sel.value = old;
    return pools;
  }
  function calc() {
    if (!$('calc')) return;
    var B = basis(), raw = String($('calc-rate').value || '').replace(/\s/g, '').replace(',', '.');
    var own = parseFloat(raw) * (UNITS[$('calc-unit').value] || 1);
    var pools = Live.S.pools.pools || [], pool = pools.filter(function (p) { return p.host === $('calc-pool').value; })[0] || pools[0];
    $('calc-pool-field').hidden = mode !== 'pool';
    U.$$('#calc [data-mode]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === mode ? 'true' : 'false'); });
    var set = function (id, v) { $(id).textContent = v; }, detail = $('calc-detail');
    detail.textContent = '';
    if (!(own > 0) || !(B.net > 0)) {
      set('calc-day', '—'); set('calc-week', '—'); set('calc-month', '—'); set('calc-share', '—');
      set('calc-note', t('calc.enter')); return;
    }
    var h = B.height, era = Math.floor(h / U.EPOCH), R = U.rewardAt(h) / U.UNIT, total = B.net + own, share = own / total;
    var fee = mode === 'pool' && pool ? pool.feeBps / 10000 : 0;
    var perDay = share * PER_DAY * R * (1 - fee);
    // Die Halbierung innerhalb des Zeitraums zählt mit: danach die halbe Belohnung
    var daysToHalving = ((era + 1) * U.EPOCH - h) * 600 / 86400;
    var over = function (d) { return perDay * Math.min(d, daysToHalving) + perDay / 2 * Math.max(0, d - daysToHalving); };
    set('calc-day', '≈ ' + amount(perDay));
    set('calc-week', amount(over(7)));
    set('calc-month', amount(over(30)));
    set('calc-share', U.num(share * 100, share < 0.001 ? 4 : 2) + ' %');
    var row = function (k, v) { detail.appendChild(U.el('div', {}, [U.el('dt', { text: k }), U.el('dd', { class: 'mono', text: v })])); };
    if (mode === 'solo') {
      row(t('calc.d.every'), every(1 / (share * PER_DAY)));
      row(t('calc.d.chance'), U.num((1 - Math.exp(-share * PER_DAY)) * 100, 1) + ' %');
      row(t('calc.d.block'), amount(R));
    } else if (pool) {
      var ps = (B.finds[pool.kette || pool.name] || 0) / B.n, withMe = ps * B.net + own;
      row(t('calc.d.poolShare', { n: U.num(B.n) }), U.num(ps * 100, 1) + ' %');
      row(t('calc.d.poolEvery'), every(1 / (withMe / total * PER_DAY)));
      row(t('calc.d.part'), amount(own / withMe * R * (1 - fee)));
      row(t('calc.d.fee'), U.num(pool.feeBps / 100, 2) + ' %');
    }
    row(t('calc.d.net', { n: U.num(B.n) }), U.hashrate(B.net));
    var note = t('calc.note');
    if (daysToHalving < 30) {
      var dh = Math.max(1, Math.round(daysToHalving));
      note = tn('calc.halving', dh, { b: U.num((era + 1) * U.EPOCH), d: U.num(dh) }) + ' ' + note;
    }
    set('calc-note', note);
  }
  function poolsTable() {
    var body = U.$('#pools-table tbody'); if (!body) return;
    var B = basis(), pools = poolList();
    body.textContent = '';
    pools.forEach(function (p) {
      var found = B.finds[p.kette || p.name] || 0, full = p.status !== 'offen';
      body.appendChild(U.el('tr', {}, [
        U.el('td', { class: 'wide' }, [U.el('strong', { text: p.name }), U.el('br'), U.el('span', { class: 'mono host', text: p.host })]),
        U.el('td', { class: 'n' }, [U.num(p.belegt) + ' / ' + U.num(p.plaetze) + (full ? ' (' + t('pools.full') + ')' : ''), U.el('br'),
          U.el('span', { class: 'host', text: p.hashrate > 0 ? t('pools.reported', { r: U.hashrate(p.hashrate) }) : '—' })]),
        U.el('td', { class: 'n', text: U.num(p.feeBps / 100, 2) + ' %' }),
        U.el('td', { class: 'n', text: U.num(p.bloecke || 0) }),
        U.el('td', { class: 'n', text: U.num(found) + ' (' + U.num(found / B.n * 100, 0) + ' %)' })]));
    });
    var th = document.getElementById('pools-th-last');
    if (th) th.textContent = t('pools.c5', { n: U.num(B.n) });
    $('pools-cap').textContent = t('pools.cap', { n: U.num(B.n) });
    UI.labelTables(document.getElementById('pools-table'));
  }
  function all() { poolsTable(); if ($('calc-pool') && !U.$('#pools-table tbody')) poolList(); calc(); }
  function init() {
    var form = $('calc'); if (!form) return;
    form.addEventListener('submit', function (e) { e.preventDefault(); });
    form.addEventListener('input', calc); form.addEventListener('change', calc);
    form.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b) return;
      mode = b.getAttribute('data-mode'); calc();
    });
    all(); U.on('data', all);
  }
  return { init: init };
})();

/* ---- 29-net.js ---- */
/* Netzseite: Verlauf aus den Blöcken (Tageswerte), Finder-Anteile, neueste Blöcke. */
var Net = (function () {
  'use strict';
  var BLUE = '#2F7BFF', SER = [
    { key: 'main', color: '#3987E5', name: 'net.s.main' },
    { key: 'gozero', color: '#D95926', name: 'net.s.gozero' },
    { key: 'solo', color: '#199E70', name: 'net.s.solo' }];
  var range = 'all';

  function days(completeOnly) {
    var d = Chain.daily().slice();
    if (completeOnly) d = d.slice(1, d.length - 1);          // erster und letzter Tag sind angebrochen
    if (range !== 'all') d = d.slice(-(+range));
    return d;
  }
  function series() { return SER.map(function (s) { return { key: s.key, color: s.color, name: t(s.name) }; }); }
  function short(v) { try { return new Intl.NumberFormat(U.loc(), { notation: 'compact', maximumFractionDigits: 1 }).format(v); } catch (e) { return U.num(v); } }

  function drawHash(root) {
    var d = days(false), log = range === 'all';
    Charts.line(root, {
      points: d.map(function (x) { return { y: x.hr || 1, label: U.dayLabel(x.d), tip: U.dayLabel(x.d) }; }),
      log: log, color: BLUE, left: 68, name: '', label: t('net.c.hash'),
      yFmt: function (v) { return v > 0 ? U.hashrate(v) : '0'; }, marks: [{ i: d.length - 1 }]
    });
    document.getElementById('cap-hash').textContent = log ? t('net.c.hash.capLog') : t('net.c.hash.capLin');
    Charts.table(document.getElementById('table-hash'), [t('net.c.day'), t('net.c.hash')],
      d.map(function (x) { return [U.dayLabel(x.d), U.hashrate(x.hr)]; }));
  }
  function drawBlocks(root) {
    var d = days(true);
    Charts.bars(root, {
      items: d.map(function (x) { return { label: U.dayLabel(x.d), n: x.n }; }),
      series: [{ key: 'n', color: BLUE, name: '' }], name: t('net.c.blocks.name'), left: 40, label: t('net.c.blocks'),
      ref: { value: 144, label: t('net.c.blocks.ref') }, yFmt: function (v) { return U.num(v); }
    });
    Charts.table(document.getElementById('table-blocks'), [t('net.c.day'), t('net.c.blocks')],
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.n)]; }));
  }
  function drawFinders(root) {
    var d = days(true), se = series();
    Charts.bars(root, {
      items: d.map(function (x) { return { label: U.dayLabel(x.d), main: x.main, gozero: x.gozero, solo: x.solo + (x.other || 0) }; }),
      series: se, left: 40, label: t('net.c.finders'), yFmt: function (v) { return U.num(v); }
    });
    var lg = document.getElementById('legend-finders'); lg.textContent = '';
    se.forEach(function (s) { lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + s.color }), s.name])); });
    Charts.table(document.getElementById('table-finders'), [t('net.c.day')].concat(se.map(function (s) { return s.name; })),
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.main), U.num(x.gozero), U.num(x.solo + (x.other || 0))]; }));
  }
  function drawTime(root) {
    var d = days(true);
    Charts.line(root, {
      points: d.map(function (x) { return { y: x.bt, label: U.dayLabel(x.d), tip: U.dayLabel(x.d) }; }),
      color: BLUE, left: 48, name: '', label: t('net.c.time'),
      refs: [{ y: 600, label: t('net.c.time.ref') }],
      yFmt: function (v, full) { return full ? U.num(v, 0) + ' s' : U.num(v, 0); }, marks: [{ i: d.length - 1 }]
    });
    Charts.table(document.getElementById('table-time'), [t('net.c.day'), t('net.c.time')],
      d.map(function (x) { return [U.dayLabel(x.d), U.num(x.bt, 0) + ' s']; }));
  }

  /* Anteile als Balken: ein Ganzes, in Teile zerlegt */
  function shareBars() {
    var root = document.getElementById('sharebars'); if (!root) return;
    var S = Live.S, se = series(), live = { main: 0, gozero: 0, solo: 0 }, b = S.blocks.slice(0, 50);
    b.forEach(function (x) {
      if (x.finder === 'Gozero') live.gozero++; else if (x.finder === 'YSKAR MAIN') live.main++; else live.solo++;
    });
    var tot = Chain.totals(), known = Chain.exactTip(), rows = [
      { label: t('net.find.last', { n: U.num(b.length) }), v: live },
      { label: t('net.find.last1000', { h: U.num(known) }), v: tot.finders1000 },
      { label: t('net.find.allb', { h: U.num(known) }), v: tot.finders }];
    root.textContent = '';
    rows.forEach(function (r) {
      var sum = se.reduce(function (a, s) { return a + (r.v[s.key] || 0); }, 0) + (r.v.other || 0) || 1, bar = U.el('div', { class: 'sharebar', role: 'img' }), names = [];
      se.forEach(function (s) {
        var val = (r.v[s.key] || 0) + (s.key === 'solo' ? (r.v.other || 0) : 0), pct = val / sum * 100;
        if (!val) return;
        var seg = U.el('span', { style: 'flex:' + val + ' 0 0;background:' + s.color });
        if (pct >= 8) seg.textContent = U.num(pct, pct < 10 ? 1 : 0) + ' %';
        bar.appendChild(seg);
        names.push(s.name + ' ' + U.num(pct, 1) + ' %');
      });
      bar.setAttribute('aria-label', r.label + ': ' + names.join(', '));
      root.appendChild(U.el('div', { class: 'sharerow' }, [U.el('span', { class: 'k', text: r.label }), bar,
        U.el('span', { class: 'vals mono', text: names.join('  ') })]));
    });
    var lg = document.getElementById('legend-share'); lg.textContent = '';
    se.forEach(function (s) { lg.appendChild(U.el('span', {}, [U.el('i', { style: 'background:' + s.color }), s.name])); });
  }
  function latest() {
    var body = U.$('#net-blocks tbody'); if (!body) return;
    body.textContent = '';
    Live.S.blocks.slice(0, 10).forEach(function (b) {
      var n = b.recipients || 1;
      body.appendChild(U.el('tr', {}, [
        U.el('td', {}, [U.el('a', { class: 'mono', href: Router.href('#explorer-block-' + b.height), text: U.num(b.height) })]),
        U.el('td', { text: Live.ago(Number(b.timestamp), Live.now()) }),
        U.el('td', { text: b.finder || t('net.b.solo') }),
        U.el('td', { class: 'n hide-s', text: tn('net.b.addr', n, { n: U.num(n) }) }),
        U.el('td', { class: 'n hide-s', text: U.num(Number(b.difficultyWert)) })]));
    });
  }
  function init() {
    if (!document.getElementById('chart-hash')) return;
    Chain.want();
    Charts.register(document.getElementById('chart-hash'), drawHash);
    Charts.register(document.getElementById('chart-blocks'), drawBlocks);
    Charts.register(document.getElementById('chart-finders'), drawFinders);
    Charts.register(document.getElementById('chart-time'), drawTime);
    document.getElementById('net-range').addEventListener('click', function (e) {
      var b = e.target.closest('[data-range]'); if (!b) return;
      range = b.getAttribute('data-range');
      U.$$('#net-range [data-range]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      Charts.refresh(true);
    });
    function rest() { shareBars(); latest(); }
    rest(); U.on('data', rest);
  }
  return { init: init };
})();

/* ---- 30-ui.js ---- */
/* Bedienung: Menü, Kopfleiste, Umschalter, Kopieren. */
var UI = (function () {
  'use strict';
  var menu, btn, bar, lastY = 0, lastFocus = null;

  function setMenu(open, quiet) {
    if (!menu) return;
    if (menu.hidden === !open) return;
    menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('menu-open', open);
    U.$('.menu-btn__t', btn).textContent = t(open ? 'nav.close' : 'nav.menu');
    if (open) { lastFocus = document.activeElement; menu.scrollTop = 0; var a = U.$('.menu__a', menu); if (a) a.focus({ preventScroll: true }); }
    else if (!quiet && lastFocus && lastFocus.focus) btn.focus({ preventScroll: true });
  }
  function nav() {
    menu = document.getElementById('menu'); btn = document.getElementById('menu-btn'); bar = document.getElementById('bar');
    btn.addEventListener('click', function () { setMenu(btn.getAttribute('aria-expanded') !== 'true'); });
    // Ein Klick auf einen Link im Menü, der zur schon offenen Seite führt, löst keinen Seitenwechsel aus: trotzdem schließen.
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false, true); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) setMenu(false);
      if (e.key === 'Tab' && !menu.hidden) {           // Fokus im Menü halten (samt Menüknopf)
        var f = [btn].concat(U.$$('a,button', menu));
        var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
    U.on('lang', function () { U.$('.menu-btn__t', btn).textContent = t(menu.hidden ? 'nav.menu' : 'nav.close'); });

    function scrolled() {
      var y = window.scrollY, down = y > lastY + 4, up = y < lastY - 4;
      bar.classList.toggle('is-solid', y > 24);
      if (y < 120 || up) bar.classList.remove('is-away');
      else if (down && y > 320 && menu.hidden) bar.classList.add('is-away');
      if (down || up) lastY = y;
    }
    window.addEventListener('scroll', scrolled, { passive: true }); scrolled();
    bar.addEventListener('focusin', function () { bar.classList.remove('is-away'); });
    U.on('route', function () { lastY = 0; bar.classList.remove('is-away'); scrolled(); });
  }

  /** Mitmachen-Leiste (schmale Bildschirme): erscheint, sobald der Seitenanfang aus dem Bild ist; weicht dem Seitenende. */
  function dock() {
    var d = document.getElementById('dock'); if (!d) return;
    d.hidden = false; d.classList.add('is-off');
    function upd() {
      var y = window.scrollY, vh = window.innerHeight, page = Router.current();
      var doc = document.documentElement.scrollHeight, foot = document.getElementById('foot');
      var nearEnd = foot ? (foot.getBoundingClientRect().top - vh) < vh * 0.9 : (y + vh > doc - vh);
      var quiet = page === 'start' || page === 'explorer';
      d.classList.toggle('is-off', quiet || y < vh * 0.9 || nearEnd);
    }
    var raf = 0;
    window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; upd(); }); }, { passive: true });
    U.on('route', function () { setTimeout(upd, 60); });
    upd();
  }

  /** <div data-tabs> mit <button data-tab="x"> und <div data-panel="x"> */
  function tabs() {
    U.$$('[data-tabs]').forEach(function (root) {
      var btns = U.$$('[data-tab]', root), panels = U.$$('[data-panel]', root);
      function show(id) {
        btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === id ? 'true' : 'false'); });
        panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== id; });
        U.emit('tab', { root: root, id: id });
      }
      btns.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
      var first = btns.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || btns[0];
      if (first) show(first.getAttribute('data-tab'));
    });
  }

  /** <button data-copy> kopiert den Text des vorangehenden .code-Blocks oder von data-copy="#id" */
  function copy() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-copy]'); if (!b) return;
      var sel = b.getAttribute('data-copy'), src = sel ? U.$(sel) : (b.parentNode.querySelector('.code') || b.previousElementSibling);
      if (src) U.copyText(src.getAttribute('data-raw') || src.textContent.trim(), b, t('ui.copied'));
    });
  }

  /** "Zum Inhalt springen": der Anker #main ist keine Seite, deshalb hier abfangen statt den Wegweiser zu rufen. */
  function skip() {
    var a = U.$('.skip'), m = document.getElementById('main');
    if (!a || !m) return;
    a.addEventListener('click', function (e) { e.preventDefault(); m.focus({ preventScroll: true }); m.scrollIntoView({ block: 'start' }); });
  }

  /** Aufklappbare Abschnitte: <button data-more="#id"> zeigt oder verbirgt das Ziel. */
  function more() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-more]'); if (!b) return;
      var target = U.$(b.getAttribute('data-more')); if (!target) return;
      var open = target.hidden;
      target.hidden = !open; b.setAttribute('aria-expanded', open ? 'true' : 'false');
      U.emit('layout');
    });
  }

  /** Gestapelte Tabellen (Telefon): jede Zelle trägt den Namen ihrer Spalte. */
  function labelTables(root) {
    var tables = root && root.matches && root.matches('table') ? [root] : U.$$('table.stack-s', root || document);
    tables.forEach(function (tb) {
      var heads = U.$$('thead th', tb).map(function (th) { return th.textContent.trim(); });
      U.$$('tbody tr', tb).forEach(function (tr) {
        U.$$('td', tr).forEach(function (td, i) { if (heads[i]) td.setAttribute('data-label', heads[i]); });
      });
    });
  }

  function init() { nav(); dock(); tabs(); copy(); skip(); more(); labelTables(); U.on('lang', function () { labelTables(); }); }
  return { init: init, labelTables: labelTables, closeMenu: function (quiet) { setMenu(false, quiet); } };
})();

/* ---- 31-explorer.js ---- */
/*
 * Explorer: Blöcke, Transaktionen und Adressen nachschlagen.
 * Er liest die öffentliche API (nur GET). Jeder angezeigte Block wird im Browser nachgerechnet: Kopf aus den Einzelfeldern
 * neu zusammengesetzt, Hash, Proof of Work, Verkettung mit dem Vorgänger. Die Prüfsumme jeder eingegebenen Adresse ebenfalls.
 *
 * Adressen im Explorer, wie Wallet, App und Miner sie seit jeher verlinken:
 *   /explorer#block-<Höhe>    /explorer#tx-<64 Hexzeichen>    /explorer#adr-<ysr1…>    /explorer#neu (der Block im Bau)
 *
 * Antwortet die API einmal nicht, zeigt er, was die Seite schon geladen hat (die neuesten Blöcke samt Kopf),
 * sagt es dazu und versucht es mit dem nächsten Stand der Kette von selbst noch einmal.
 */
var Explorer = (function () {
  'use strict';
  var ZERO = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';
  var CHARS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  var view, top, input, msgEl, token = 0, searchToken = 0, proof = null;
  var known = {}, lowest = Infinity, listMode = null, lastTop = -1, busyOlder = false, seenTop = -1, seenLive = false;
  var cache = { block: {}, tx: {}, acc: {} }, cur = { kind: 'home' }, shown = null;
  var more = {}, busyMore = false, viewTip = -1;      // nachgeladene ältere Bewegungen je Adresse: { list, next, top }
  var checks = {}, side = {}, sideBusy = {}, mirrorSince = null;   // Prüfergebnisse je Höhe; Vorgänger, die nicht in der Liste stehen
  var atTip = null;                                                // der Verweis "nächster Block" des Blocks an der Spitze
  var MAX_TX = 2000, MAX_TX_V6 = 5000, DIFF_V4 = 6000;            // wie src/lib/core/params.ts

  /* ---------- kleine Bausteine ---------- */
  function live() { return Live.S.mode === 'live'; }
  function node(tag, cls, text) {
    var a = {}; if (cls) a['class'] = cls; if (text !== undefined && text !== null) a.text = text;
    return U.el(tag, a);
  }
  /** Link innerhalb der Website; `ref` in der Schreibweise der Quellen ("#explorer-block-12", "#chain-accounts"). */
  function link(ref, text, cls) { var a = { href: Router.href(ref), text: text }; if (cls) a['class'] = cls; return U.el('a', a); }
  function ext(href, text) { return U.el('a', { href: href, text: text, 'class': 'ext', target: '_blank', rel: 'noopener' }); }
  function addr(a) {
    var e = U.el('a', { href: Router.href('#explorer-adr-' + a), 'class': 'mono addr', title: a });
    e.appendChild(node('span', 'a-full', a)); e.appendChild(node('span', 'a-short', U.shortHash(a, 9, 5)));
    return e;
  }
  function when(ts) { return node('span', null, U.date(Number(ts), true)); }
  function memoText(hex) {
    if (!hex) return null;
    try {
      var s = new TextDecoder('utf-8', { fatal: true }).decode(U.hexToBytes(hex));
      return /^[^\u0000-\u001f\u007f-\u009f]+$/.test(s) ? s : null;
    } catch (e) { return null; }
  }
  function api(path) {
    return fetch(Live.API + path, { cache: 'no-store' }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, status: r.status, j: j }; }, function () { return { ok: false, status: r.status, j: null }; });
    });
  }
  function setMsg(text, bad) { msgEl.textContent = text || ''; msgEl.classList.toggle('err', !!bad && !!text); }
  function go(rest) { Router.go(rest ? '#explorer-' + rest : '#explorer'); }

  /* ---------- Adressprüfung (bech32m, Vorsilbe ysr) ---------- */
  function polymod(v) {
    var G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3], chk = 1, i, k, b;
    for (i = 0; i < v.length; i++) {
      b = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v[i];
      for (k = 0; k < 5; k++) if ((b >>> k) & 1) chk ^= G[k];
    }
    return chk >>> 0;
  }
  /** 'ok' | 'shape' (keine YSKAR-Adresse) | 'sum' (Tippfehler: Prüfsumme stimmt nicht) */
  function checkAddress(a) {
    if (a.slice(0, 4) !== 'ysr1' || (a.length !== 42 && a.length !== 63)) return 'shape';
    var v = [3, 3, 3, 0, 25, 19, 18], i, c;                       // Vorsilbe "ysr", aufgespreizt
    for (i = 4; i < a.length; i++) { c = CHARS.indexOf(a.charAt(i)); if (c < 0) return 'sum'; v.push(c); }
    return polymod(v) === 0x2bc830a3 ? 'ok' : 'sum';
  }

  /* ---------- Was die Seite schon geladen hat ---------- */
  function headerOf(h) {
    var b = Live.S.blocks, k;
    if (known[h] && known[h].header) return known[h];
    for (k = 0; k < b.length; k++) if (b[k].height === h && b[k].header) return b[k];
    return null;
  }
  function heightOfHash(x) {
    var b = Live.S.blocks, k;
    for (k = 0; k < b.length; k++) if (b[k].hash === x) return b[k].height;
    for (k in known) if (known[k].hash === x) return known[k].height;
    for (k in cache.block) if (cache.block[k].hash === x) return cache.block[k].height;
    return null;
  }

  /* ---------- Prüfen im Browser ---------- */
  /** Plätze für Transaktionen in Block h (ab Konsensfassung 6 mehr). */
  function slotsAt(h) {
    var v6 = Number(Live.S.fees && Live.S.fees.aktivierung) || U.V6;
    return v6 > 0 && h >= v6 ? MAX_TX_V6 : MAX_TX;
  }
  function percent(p) { return U.num(p, p > 0 && p < 10 ? 2 : 0); }
  function span(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m ? U.num(m) + ' min ' : '') + s + ' s';
  }
  /** Setzt die 136 Byte des Kopfes aus den einzeln gemeldeten Feldern neu zusammen (wie src/lib/core/block.ts). */
  function serialize(b) {
    var out = new Uint8Array(136), dv = new DataView(out.buffer), one = BigInt(1), e, m, field;
    var v = BigInt(b.difficultyWert !== undefined && b.difficultyWert !== null ? b.difficultyWert : b.difficulty);
    if (b.height < DIFF_V4 || v < (one << BigInt(31))) field = Number(v);       // ab Fassung 4 über 2^31 als Gleitkomma
    else { e = BigInt(v.toString(2).length) - BigInt(24); m = v >> e; field = Number((one << BigInt(31)) | (e << BigInt(23)) | (m - (one << BigInt(23)))); }
    dv.setUint32(0, b.version === undefined || b.version === null ? 1 : b.version, true);
    dv.setUint32(4, b.height, true);
    out.set(U.hexToBytes(b.prevHash), 8); out.set(U.hexToBytes(b.merkleRoot), 40); out.set(U.hexToBytes(b.stateRoot), 72);
    dv.setBigUint64(104, BigInt(b.timestamp), true);
    dv.setUint32(112, field, true);
    dv.setUint32(116, b.txCount, true);
    dv.setBigUint64(120, BigInt(b.extranonce), true);
    dv.setBigUint64(128, BigInt(b.nonce), true);
    return out;
  }
  /**
   * Vier getrennte Aussagen zu einem Block, jede 'ok' | 'bad' | 'open':
   *   ser   aus den Einzelfeldern ergibt sich genau der gespeicherte Kopf
   *   hash  der hier errechnete Hash ist der gemeldete
   *   pow   der Hash liegt unter dem Ziel der eingetragenen Difficulty
   *   link  das Feld "Vorgänger" ist der hier errechnete Hash des Blocks eine Höhe darunter
   */
  function check(b) {
    var c = checks[b.height], bytes, mine, target, prev, hv;
    if (!c || c.of !== b.hash) {
      c = { of: b.hash, ser: 'open', hash: 'open', pow: 'open', link: 'open', mine: null, achieved: null };
      try {
        bytes = U.hexToBytes(b.header);
        mine = U.bytesToHex(Sha.digest(Sha.digest(bytes)));
        target = U.targetHex(U.parseHeader(b.header).difficulty);
        c.mine = mine;
        c.hash = mine === b.hash ? 'ok' : 'bad';
        c.pow = mine <= target ? 'ok' : 'bad';
        hv = BigInt('0x' + mine);
        c.achieved = hv === BigInt(0) ? null : (BigInt(1) << BigInt(240)) / hv;
        if (b.prevHash && b.merkleRoot && b.stateRoot && b.nonce !== undefined) c.ser = U.bytesToHex(serialize(b)) === b.header ? 'ok' : 'bad';
      } catch (e) { c.hash = c.pow = 'bad'; }
      checks[b.height] = c;
    }
    if (c.link === 'open' && b.height > 0 && c.mine) {
      prev = headerOf(b.height - 1) || side[b.height - 1] || cache.block[b.height - 1];
      if (prev && prev.header) {
        try { c.link = U.parseHeader(b.header).prev === U.bytesToHex(Sha.digest(Sha.digest(U.hexToBytes(prev.header)))) ? 'ok' : 'bad'; }
        catch (e2) { c.link = 'bad'; }
      }
    }
    return c;
  }
  /** 'ok' = hier nachgerechnet, 'bad' = eine Prüfung schlug fehl, 'open' = noch nicht geprüft. */
  function verdictOf(c) {
    if (!c) return 'open';
    if (c.ser === 'bad' || c.hash === 'bad' || c.pow === 'bad' || c.link === 'bad') return 'bad';
    return c.hash === 'ok' && c.pow === 'ok' ? 'ok' : 'open';
  }
  function dot(state, title) {
    var d = node('i', 'dot ' + state);
    if (title) { d.title = title; d.setAttribute('role', 'img'); d.setAttribute('aria-label', title); } else d.setAttribute('aria-hidden', 'true');
    return d;
  }
  /** Holt den Block eine Höhe unter h, wenn die Seite ihn noch nicht hat; erst mit ihm lässt sich die Verkettung prüfen. */
  function needPrev(h, done) {
    if (h <= 0 || headerOf(h - 1) || side[h - 1] || cache.block[h - 1] || sideBusy[h] || !live()) return;
    sideBusy[h] = true;
    api('/blocks?limit=1&before=' + h).then(function (r) {
      delete sideBusy[h];
      var b = r.ok && r.j && r.j.blocks && r.j.blocks[0];
      if (b && b.height === h - 1 && b.header) { side[h - 1] = b; done(); }
    }, function () { delete sideBusy[h]; });
  }

  /* ---------- Blockliste ---------- */
  function sync() {
    var b = Live.S.blocks, hi = b[0].height, lo = b[b.length - 1].height;
    if (listMode !== Live.S.mode || lo > lastTop + 1) { known = {}; lowest = Infinity; listMode = Live.S.mode; }
    b.forEach(function (x) { known[x.height] = x; });
    if (lo < lowest) lowest = lo;
    lastTop = hi;
  }
  function table(cols, rows, cls) {
    var tr = U.el('tr');
    cols.forEach(function (c) { var th = node('th', c.cls || null, c.h); th.setAttribute('scope', 'col'); tr.appendChild(th); });
    var body = U.el('tbody');
    rows.forEach(function (r) {
      var row = U.el('tr');
      r.forEach(function (cell, i) {
        var td = node('td', cols[i].cls || null); td.setAttribute('data-label', cols[i].h);
        if (cell === null || cell === undefined) { td.textContent = '–'; td.classList.add('empty'); }
        else if (typeof cell === 'string') td.textContent = cell; else td.appendChild(cell);
        row.appendChild(td);
      });
      body.appendChild(row);
    });
    var tb = U.el('table', { 'class': 'tbl ex-tbl' + (cls ? ' ' + cls : '') }, [U.el('thead', {}, [tr]), body]);
    return U.el('div', { 'class': 'tbl-scroll' }, [tb]);
  }

  /* ---------- Ansicht: neueste Blöcke ---------- */
  /** Blockhash gekürzt; die führenden Nullen (die geleistete Arbeit) sind eigens ausgezeichnet. */
  function hashNode(hash) {
    var sh = U.shortHash(hash, 12, 8), z = /^0*/.exec(sh)[0], e = node('span', 'xb__hash mono');
    if (z) e.appendChild(node('span', 'z', z));
    e.appendChild(document.createTextNode(sh.slice(z.length)));
    return e;
  }
  function txCountText(n) { return n === 0 ? t('ex.row.tx0') : tn('ex.row.tx', n, { n: U.num(n) }); }
  /**
   * Spiegel und Full Node vergleichen: Die Blockliste kommt aus dem Spiegel (Datenbank), /summary vom Full Node.
   * Zeigt der Spiegel auf derselben Höhe einen anderen Block oder liegt er zurück, steht ein Hinweis da, sobald das
   * länger als eine Minute so bleibt. Ein Block Rückstand für ein paar Sekunden ist normal.
   */
  function mirrorNote() {
    var s = Live.S.summary, head = Live.S.blocks[0], text = '', behind;
    if (live() && s && head && s.height === Number(s.height)) {
      if (s.height === head.height && typeof s.tipHash === 'string' && s.tipHash.toLowerCase() !== String(head.hash).toLowerCase()) text = t('ex.mirror.fork', { h: U.num(head.height) });
      else if (s.height > head.height) { behind = s.height - head.height; text = tn('ex.mirror.behind', behind, { n: U.num(behind) }); }
    }
    if (!text) { mirrorSince = null; return null; }
    if (mirrorSince === null) mirrorSince = Date.now();
    return Date.now() - mirrorSince < 60000 ? null : text;
  }
  function drawHome() {
    sync();
    var tip = Live.S.blocks[0].height, rows = [], h, now = Live.now(), good = 0, bad = 0;
    for (h = tip; h >= lowest && h >= 0; h--) if (known[h]) rows.push(known[h]);
    var list = U.el('ol', { 'class': 'xbl' });
    if (live()) {                                           // der Block, an dem gerade gesucht wird
      var waiting = Number(Live.S.summary.mempool) || 0;
      list.appendChild(U.el('li', { 'class': 'is-next' }, [U.el('a', { 'class': 'xb', href: Router.href('#explorer-neu') }, [
        U.el('span', { 'class': 'xb__h mono' }, [document.createTextNode(U.num(tip + 1)), node('i', 'ring')]),
        node('span', 'xb__age', t('ex.next.tag')),
        node('span', 'xb__by', '–'),
        node('span', 'xb__tx' + (waiting ? '' : ' quiet'), txCountText(waiting)),
        node('span', 'xb__size', ''), node('span', 'xb__hash mono', '')])]));
    }
    rows.forEach(function (b) {
      var n = Math.max(0, (b.txCount || 1) - 1), age = node('span', 'xb__age', Live.ago(Number(b.timestamp), now));
      age.title = U.date(Number(b.timestamp), true);
      var fresh = seenLive && live() && seenTop >= 0 && b.height > seenTop && tip - seenTop < 4;
      var v = b.header ? verdictOf(check(b)) : 'open', num = U.el('span', { 'class': 'xb__h mono' }, [document.createTextNode(U.num(b.height))]);
      if (v === 'ok') { good++; num.appendChild(dot('ok', t('ex.verified'))); } else if (v === 'bad') { bad++; num.appendChild(dot('bad', t('ex.check.bad'))); }
      list.appendChild(U.el('li', fresh ? { 'class': 'is-new' } : {}, [U.el('a', { 'class': 'xb', href: Router.href('#explorer-block-' + b.height) }, [
        num, age,
        node('span', 'xb__by', b.finder || t('ex.solo')),
        node('span', 'xb__tx' + (n ? '' : ' quiet'), txCountText(n)),
        node('span', 'xb__size', t('ex.bytes', { n: U.num(b.sizeBytes || 0) })),
        hashNode(b.hash)])]));
    });
    seenTop = tip; seenLive = live();
    var heads = U.el('div', { 'class': 'xbl__head', 'aria-hidden': 'true' }, [
      node('span', null, t('ex.c.height')), node('span', null, t('ex.c.found')), node('span', null, t('ex.c.by')),
      node('span', null, t('ex.c.transfers')), node('span', 'xb__size', t('ex.c.size')), node('span', 'xb__hash', t('ex.c.hash'))]);
    var foot = U.el('div', { 'class': 'ex-foot' }, [
      node('p', 'fig-cap', live() ? t('ex.latest.live') : t('ex.latest.snap', { n: U.num(rows.length) }))]);
    if (live() && lowest > 0) {
      var more = U.el('button', { type: 'button', 'class': 'btn small ghost', text: busyOlder ? t('ex.older.busy') : t('ex.older') });
      if (busyOlder) more.disabled = true;
      more.addEventListener('click', older);
      foot.appendChild(more);
    }
    var kids = [U.el('div', { 'class': 'display-head' }, [node('h2', 'display-title', t('ex.latest.h')), node('span', 'state', Live.values().modeShort)])];
    var note = mirrorNote();
    if (note) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, note)]));
    kids.push(U.el('div', {}, [heads, list]));
    if (good || bad) {
      var said = U.el('p', { 'class': 'ex-said ' + (bad ? 'bad' : 'ok') }, [dot(bad ? 'bad' : 'ok'),
        node('span', null, bad ? t('ex.verdict.bad') : tn('ex.verdict.ok', good, { n: U.num(good) }))]);
      kids.push(U.el('div', { 'class': 'ex-checked' }, [said, node('p', 'fig-cap', t('ex.check.p'))]));
    }
    kids.push(foot);
    paint([Pulse.set({ mode: 'tip' }), U.el('div', { 'class': 'display' }, kids)], false);
    document.title = t('title.explorer') + ' – YSKAR';
  }
  function older() {
    if (busyOlder || !live()) return;
    busyOlder = true; if (cur.kind === 'home') drawHome();
    api('/blocks?limit=25&before=' + lowest).then(function (r) {
      busyOlder = false;
      if (r.ok && r.j && r.j.blocks) r.j.blocks.forEach(function (b) { known[b.height] = b; if (b.height < lowest) lowest = b.height; });
      if (cur.kind === 'home') drawHome();
    }, function () { busyOlder = false; if (cur.kind === 'home') drawHome(); });
  }

  /* ---------- gemeinsame Teile der Einzelansichten ---------- */
  function paint(kids, compact) {
    if (proof) { Proof.unmount(proof); proof = null; }
    top.classList.toggle('compact', !!compact);
    view.textContent = '';
    view.appendChild(U.el('section', { 'class': 'sec tight ex-sec' }, [U.el('div', { 'class': 'wrap stack ex-stack' }, kids)]));
  }
  function crumbs(parts) {
    var n = U.el('nav', { 'class': 'crumbs small', 'aria-label': t('ex.crumb') }), i;
    n.appendChild(link('#explorer', t('ex.crumb')));
    for (i = 0; i < parts.length; i++) {
      n.appendChild(node('span', 'sep', '/'));
      n.appendChild(parts[i].href ? link(parts[i].href, parts[i].text) : node('span', 'here', parts[i].text));
    }
    return n;
  }
  /** Eine Zeile "Bezeichnung: Wert"; `sub` ist eine Unterzeile oder eine Liste davon (Text oder Knoten). */
  function fact(label, value, sub) {
    var dd = U.el('dd');
    if (typeof value === 'string') dd.appendChild(node('span', 'mono wrapany', value)); else dd.appendChild(value);
    (Array.isArray(sub) ? sub : [sub]).forEach(function (x) {
      if (x) dd.appendChild(typeof x === 'string' ? node('span', 'sub', x) : x);
    });
    return U.el('div', {}, [node('dt', null, label), dd]);
  }
  function meter(p) {
    var m = U.el('span', { 'class': 'meter', 'aria-hidden': 'true' }, [U.el('i')]);
    m.firstChild.style.width = Math.max(0, Math.min(100, p)).toFixed(2) + '%';
    return m;
  }
  function wait() { paint([node('p', 'ex-wait', t('ex.loading'))], cur.kind !== 'home'); }
  function none(text) {
    paint([crumbs([]), node('p', 'ex-none', text), U.el('p', {}, [link('#explorer', t('ex.back'))])], true);
  }
  /** Die API antwortet gerade nicht: sagen, was los ist, und einen neuen Versuch anbieten. */
  function unreachable() {
    var again = U.el('button', { type: 'button', 'class': 'btn small ghost', text: t('ex.missing.link') });
    again.addEventListener('click', function () { Live.refresh(); render(false); });
    var box = U.el('div', { 'class': 'limit' }, [U.el('div', { 'class': 'stack', style: '--gap:8px' }, [
      node('strong', null, t('ex.missing.h')), node('p', null, t('ex.missing.p')), U.el('p', {}, [again])])]);
    paint([crumbs([]), box, U.el('p', {}, [link('#explorer', t('ex.back'))])], true);
  }
  /**
   * Lädt einen Datensatz: aus dem Zwischenspeicher, sonst von der API.
   *   o.open(j)   true, wenn sich der Datensatz noch ändern kann (wartende Zahlung): nicht merken, mit jedem neuen Stand neu lesen
   *   o.spare()   was sich zeigen lässt, wenn die API nicht antwortet
   * `quiet`: Der Datensatz steht schon auf dem Bildschirm und wird nur aufgefrischt; bis die Antwort da ist, bleibt er stehen.
   */
  function resolve(o, quiet) {
    var my = ++token, hit = cache[o.store][o.key];
    if (hit) { cur.pending = false; cur.open = false; cur.source = 'live'; return void o.draw(hit, false); }
    if (!quiet) { cur.pending = false; cur.open = false; cur.source = null; wait(); }
    function down() {
      cur.pending = true;                                  // mit dem nächsten Stand der Kette noch einmal versuchen
      if (quiet) return;
      var s = o.spare ? o.spare() : null;
      if (s) { cur.source = 'snapshot'; o.draw(s, true); } else { cur.source = 'snapshot'; unreachable(); }
    }
    api(o.path).then(function (r) {
      if (my !== token) return;
      if (r.ok && r.j && o.valid(r.j)) {
        cur.pending = false; cur.source = 'live';
        cur.open = !!(o.open && o.open(r.j));
        if (!cur.open) cache[o.store][o.key] = r.j;
        o.draw(r.j, false);
      } else if (r.status === 404 || r.status === 400) {
        cur.pending = false; cur.source = 'live'; cur.open = !!o.again;
        if (!quiet) none(o.noneText());
      } else down();
    }, function () { if (my === token) down(); });
  }

  /* ---------- Ansicht: Block ---------- */
  function recipientsTable(rec, total) {
    var sum = Number(total) || rec.reduce(function (a, r) { return a + Number(r.amount); }, 0) || 1;
    return table([{ h: t('ex.tx.c.addr') }, { h: t('ex.tx.c.amount'), cls: 'n' }, { h: t('ex.tx.c.share'), cls: 'n' }],
      rec.slice().sort(function (a, b) { return Number(b.amount) - Number(a.amount); }).map(function (r) {
        var p = Number(r.amount) / sum * 100;
        return [addr(r.address), U.ysr(r.amount, { bare: true }), p > 0 && p < 0.005 ? '< ' + U.num(0.01, 2, 2) + ' %' : U.num(p, 2, 2) + ' %'];
      }));
  }
  function rewardLine(x, height) {
    var created = U.rewardAt(height), fees = Number(x.amount) - created;
    return fees > 0 ? t('ex.tx.newFees', { a: U.ysr(created), f: U.ysr(fees) }) : t('ex.tx.new', { a: U.ysr(x.amount) });
  }
  function typeLabel(x) {
    return x.type === 'coinbase' ? t('ex.tx.coinbase') : x.type === 'transfer' ? t('ex.tx.transfer') : x.type === 'batch' ? t('ex.tx.batch')
      : x.type === 'script_spend' ? t('ex.tx.script') : t('ex.tx.other', { type: String(x.type) });
  }
  function toNode(a) {
    var s = U.el('span', { 'class': 'ex-party' }, [addr(a)]);
    if (a === ZERO) s.appendChild(node('span', 'tag', t('ex.unspendable')));
    return s;
  }
  function txEntry(x, height) {
    var kv = U.el('dl', { 'class': 'kv ex-kv' }), m = memoText(x.memo), art;
    function row(k, v) { kv.appendChild(U.el('div', {}, [node('dt', null, k), typeof v === 'string' ? node('dd', 'mono', v) : U.el('dd', {}, [v])])); }
    if (x.from) row(t('ex.tx.from'), toNode(x.from));
    if (x.to) row(t('ex.tx.to'), toNode(x.to));
    if (x.type !== 'coinbase' && x.fee !== undefined && x.fee !== null) row(t('ex.tx.fee'), U.ysr(x.fee));
    if (m) row(t('ex.tx.memo'), m); else if (x.memo) row(t('ex.tx.memoHex'), x.memo);
    row(t('ex.tx.id'), link('#explorer-tx-' + x.txid, U.shortHash(x.txid, 12, 10), 'mono'));
    art = U.el('article', { 'class': 'ex-tx' }, [
      U.el('header', {}, [node('h3', null, typeLabel(x)), node('span', 'amt mono', U.ysr(x.amount))])]);
    if (x.type === 'coinbase') art.appendChild(node('p', 'sub', rewardLine(x, height)));
    art.appendChild(kv);
    if (x.recipients && x.recipients.length) {
      art.appendChild(node('p', 'sub', t('ex.tx.paid', { n: U.num(x.recipients.length) })));
      art.appendChild(recipientsTable(x.recipients, x.amount));
    }
    return art;
  }
  function drawBlock(b, partial) {
    var h = b.height, tip = Math.max(Live.S.summary.height, h), ts = Number(b.timestamp), txs = b.txs || null, cb = txs && txs[0];
    var isPool = cb ? !!(cb.recipients && cb.recipients.length > 1) : (b.recipients || 1) > 1;
    var who = cb ? memoText(cb.memo) : b.finder, d = U.date(ts, true), ago = Live.ago(ts, Live.now());
    var sum = h === 0 ? t('ex.block.sumGenesis', { date: U.date(ts) })
      : isPool && who ? t('ex.block.sumPool', { date: d, ago: ago, who: who })
        : isPool ? t('ex.block.sumPoolNoName', { date: d, ago: ago }) : t('ex.block.sumSolo', { date: d, ago: ago });
    var navs = U.el('div', { 'class': 'row ex-nav' });
    if (h > 0) navs.appendChild(link('#explorer-block-' + (h - 1), t('ex.prev'), 'btn small ghost'));
    atTip = null;
    if (h < tip) navs.appendChild(link('#explorer-block-' + (h + 1), t('ex.next'), 'btn small ghost'));
    else if (live()) { atTip = { h: h, a: link('#explorer-neu', t('ex.next'), 'btn small ghost') }; navs.appendChild(atTip.a); }   // an der Spitze: der Block im Bau
    var head = U.el('div', { 'class': 'ex-head' }, [
      U.el('div', {}, [node('h1', 'ex-title', t('ex.block.h', { h: U.num(h) })), node('p', 'lead ex-sum', sum)]), navs]);
    var kids = [crumbs([{ text: t('ex.block.h', { h: U.num(h) }) }]), head];
    if (partial) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, t('ex.block.partial'))]));

    if (Pulse.has(h)) kids.push(Pulse.set({ mode: 'around', h: h }));
    var pr = U.el('div', { 'class': 'display wide', 'data-proof': 'fixed', 'data-hex': b.header, 'data-trace': 'short', 'data-legend': 'chips', 'data-plain': '' });
    kids.push(U.el('div', { 'class': 'ex-proof' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.proof.h')), node('p', 'muted', t('ex.proof.p'))]), pr]));

    // Vier Aussagen, getrennt: eine Gesamtnote würde verstecken, was geprüft wurde
    var c = check(b), linkLi = null, timeRow, factsEl;
    function before() { return h > 0 ? (headerOf(h - 1) || side[h - 1] || cache.block[h - 1]) : null; }
    function state(label, v, toPrev) {
      var nm = U.el('span', { 'class': 'nm' }, [dot(v), node('span', null, label)]);
      if (toPrev) { nm.appendChild(node('span', 'sep', '·')); nm.appendChild(link('#explorer-block-' + (h - 1), t('ex.block.h', { h: U.num(h - 1) }))); }
      return U.el('li', { 'class': v }, [nm, node('span', 'st', t('ex.check.' + v))]);
    }
    function timeFact() {
      var p = before();
      return p && p.timestamp ? fact(t('ex.f.time'), node('span', null, span(ts - Number(p.timestamp))), t('ex.f.time.s')) : null;
    }
    var list4 = U.el('ul', { 'class': 'checks' }, [state(t('ex.check.ser'), c.ser), state(t('ex.check.hash'), c.hash), state(t('ex.check.pow'), c.pow)]);
    if (h > 0) { linkLi = state(t('ex.check.link'), c.link, true); list4.appendChild(linkLi); }
    kids.push(U.el('div', { 'class': 'split ex-split' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.check.h')), node('p', 'muted', t('ex.check.note'))]), list4]));

    var hd = U.parseHeader(b.header), diff = Number(hd.difficulty);
    var prev = h > 0 ? link('#explorer-block-' + (h - 1), b.prevHash || hd.prev, 'mono wrapany') : node('span', null, t('ex.f.prev.none'));
    var n = b.txCount || (txs ? txs.length : 1), fill = Math.min(100, n / slotsAt(h) * 100);
    var rows = [fact(t('ex.f.hash'), b.hash), fact(t('ex.f.prev'), prev)];
    timeRow = timeFact();
    if (timeRow) rows.push(timeRow);
    rows.push(
      fact(t('ex.f.merkle'), b.merkleRoot || hd.merkle, t('ex.f.merkle.s')),
      fact(t('ex.f.state'), b.stateRoot || hd.state, t('ex.f.state.s')),
      fact(t('ex.f.diff'), U.num(diff), [t('ex.f.diff.s', { n: U.compact(diff * 65536, 0) }), c.achieved ? t('ex.f.achieved') + ' ' + U.num(Number(c.achieved)) : null]),
      fact(t('ex.f.nonce'), hd.nonce.toLocaleString(U.loc()) + ' / ' + hd.extra.toLocaleString(U.loc()), t('ex.f.nonce.s')),
      fact(t('ex.f.size'), tn('ex.f.size.v', n, { n: U.num(b.sizeBytes || 0), tx: U.num(n) }),
        [t('ex.fill', { p: percent(fill) }) + ' · ' + t('ex.fill.of', { n: U.num(n), max: U.num(slotsAt(h)) }), meter(fill)]));
    factsEl = U.el('dl', { 'class': 'facts ex-facts' }, rows);
    kids.push(U.el('div', { 'class': 'split ex-split' }, [
      U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.block.values')), node('p', 'muted', t('ex.block.values.p'))]), factsEl]));
    // Der Vorgänger fehlt noch: holen, dann Verkettung und Blockzeit an Ort und Stelle nachtragen
    if (h > 0 && !before()) needPrev(h, function () {
      if (!view.contains(factsEl)) return;
      var li = state(t('ex.check.link'), check(b).link, true), row = timeFact();
      linkLi.parentNode.replaceChild(li, linkLi); linkLi = li;
      if (row && !timeRow) { factsEl.insertBefore(row, factsEl.children[2] || null); timeRow = row; }
    });

    if (txs && txs.length) {
      var list = U.el('div', { 'class': 'display ex-txs' });
      txs.forEach(function (x) { list.appendChild(txEntry(x, h)); });
      kids.push(U.el('div', { 'class': 'split ex-split' }, [
        U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.txs.h')), node('p', 'muted', t('ex.txs.p'))]), list]));
    }
    paint(kids, true);
    proof = Proof.mount(pr, false);
    document.title = t('ex.block.h', { h: U.num(h) }) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showBlock(h, quiet) {
    resolve({
      store: 'block', key: h, path: '/blocks/' + h,
      valid: function (j) { return !!j.hash && !!j.header; },
      noneText: function () { return t('ex.none.block', { h: U.num(h), tip: U.num(Live.S.summary.height) }); },
      spare: function () { return headerOf(h); },           // den Kopf der neuesten Blöcke hat die Seite schon
      draw: drawBlock
    }, quiet);
  }

  /* ---------- Ansicht: der Block im Bau ---------- */
  /*
   * Der Block, an dem gerade gesucht wird. Hier steht nur, was feststeht: Vorgänger, Belohnung, wartende Zahlungen.
   * Seine Difficulty rechnet das Netz erst mit dem Block aus; sie steht deshalb nicht da.
   */
  function drawNext() {
    var s = Live.S.summary, tip = s.height, next = tip + 1, waiting = Number(s.mempool) || 0, f = Live.S.fees || {};
    var fill = Math.min(100, (waiting + 1) / slotsAt(next) * 100);
    var title = U.el('h1', { 'class': 'ex-title' }, [document.createTextNode(t('ex.block.h', { h: U.num(next) }) + ' '), node('span', 'tag', t('ex.next.tag'))]);
    var head = U.el('div', { 'class': 'ex-head' }, [
      U.el('div', {}, [title, node('p', 'lead ex-sum', (waiting ? t('ex.next.some') : t('ex.next.empty')) + ' ' + t('ex.next.who'))]),
      U.el('div', { 'class': 'row ex-nav' }, [link('#explorer-block-' + tip, t('ex.prev'), 'btn small ghost')])]);
    var facts = U.el('dl', { 'class': 'facts ex-facts' }, [
      fact(t('ex.f.prev'), link('#explorer-block-' + tip, t('ex.block.h', { h: U.num(tip) }))),
      fact(t('ex.next.reward'), node('span', null, U.ysr(s.nextReward))),
      fact(t('ex.next.pending'), node('span', null, U.num(waiting)), [t('ex.fill', { p: percent(fill) }), meter(fill)])]);
    var rows = (Array.isArray(f.bloecke) ? f.bloecke : []).slice(0, 12).filter(function (b) { return Number(b.hoehe) > 0; });
    var base = Number(f.basisBytes) || 168, pace = Number(f.blockzeit) || 600, queue;
    if (!rows.length) queue = node('p', 'ex-queue-none', t('ex.queue.none'));
    else {
      queue = U.el('ul', { 'class': 'ex-queue' }, rows.map(function (b) {
        var fee = U.ysr(Math.ceil(Number(b.minJeByte) * base)), min = Math.max(1, Math.round(Number(b.block) * pace / 60));
        return U.el('li', {}, [node('span', 'mono', t('ex.addr.blockN', { h: U.num(Number(b.hoehe)) })),
          node('span', 'q', t('ex.queue.row', { n: U.num(Number(b.anzahl) || 0), fee: fee, min: U.num(min) }))]);
      }));
    }
    var notes = [];
    if (rows.length && Number(f.bloeckeGesamt) > rows.length) notes.push(t('ex.queue.more', { n: U.num(Number(f.inVorschau) || 0), b: U.num(Number(f.bloeckeGesamt)) }));
    if (rows.length) notes.push(t('ex.queue.note'));
    var qBox = U.el('div', { 'class': 'display' }, [queue]);
    if (notes.length) qBox.appendChild(node('p', 'fig-cap', notes.join(' ')));
    paint([crumbs([{ text: t('ex.block.h', { h: U.num(next) }) }]), head, Pulse.set({ mode: 'tip' }),
      U.el('div', { 'class': 'split ex-split' }, [U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.next.h'))]), facts]),
      U.el('div', { 'class': 'split ex-split' }, [U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.queue.h'))]), qBox])], true);
    document.title = t('ex.block.h', { h: U.num(next) }) + ' · ' + t('ex.next.tag') + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showNext() {
    token++;
    cur.source = live() ? 'live' : 'snapshot';
    cur.pending = !live();                                  // antwortet die Kette nicht, mit dem nächsten Stand noch einmal
    if (live()) drawNext(); else unreachable();
  }

  /* ---------- Ansicht: Transaktion ---------- */
  function copyBtn(text, label) {
    var b = U.el('button', { type: 'button', 'class': 'btn small ghost', text: label });
    b.addEventListener('click', function () { U.copyText(text, b, t('ui.copied')); });
    return b;
  }
  function drawTx(x) {
    var waiting = x.status === 'pending', h = waiting ? null : Number(x.height), m = memoText(x.memo), rows = [], w = x.warteplatz;
    rows.push(fact(t('ex.tx.id'), x.txid));
    if (waiting) {
      var sure = w && w.hoehe !== null && w.hoehe !== undefined && isFinite(Number(w.hoehe));
      rows.push(fact(t('ex.txv.status'), node('span', null, t('ex.txv.waiting')),
        sure ? t('ex.txv.expected', { h: U.num(Number(w.hoehe)), min: U.num(Math.max(1, Number(w.minuten) || 0)) }) : t('ex.txv.unknownWhen')));
    } else rows.push(fact(t('ex.txv.block'), link('#explorer-block-' + h, U.num(h), 'mono')));
    if (x.from) rows.push(fact(t('ex.tx.from'), toNode(x.from)));
    if (x.to) rows.push(fact(t('ex.tx.to'), toNode(x.to)));
    rows.push(fact(t('ex.tx.amount'), U.ysr(x.amount), x.type === 'coinbase' && !waiting ? rewardLine(x, h) : null));
    if (x.type !== 'coinbase') {
      rows.push(fact(t('ex.tx.fee'), U.ysr(x.fee || 0)));
      if (x.nonce !== null && x.nonce !== undefined) rows.push(fact(t('ex.tx.nonce'), U.num(Number(x.nonce)), t('ex.tx.nonce.s')));
      if (x.validUntil !== undefined) rows.push(fact(t('ex.txv.until'), node('span', null, Number(x.validUntil) > 0 ? t('ex.txv.until.h', { h: U.num(Number(x.validUntil)) }) : t('ex.txv.until.none'))));
    }
    if (m) rows.push(fact(t('ex.tx.memo'), node('span', null, m))); else if (x.memo) rows.push(fact(t('ex.tx.memoHex'), x.memo));
    if (x.raw) rows.push(fact(t('ex.txv.size'), t('ex.bytes', { n: U.num(x.raw.length / 2) })));
    var kids = [
      crumbs(waiting ? [{ text: typeLabel(x) }] : [{ href: '#explorer-block-' + h, text: t('ex.block.h', { h: U.num(h) }) }, { text: typeLabel(x) }]),
      U.el('div', { 'class': 'ex-head' }, [U.el('div', {}, [
        node('h1', 'ex-title', typeLabel(x)),
        node('p', 'lead ex-sum', waiting ? t('ex.txv.sumPending') : t('ex.txv.sum', { h: U.num(h), date: U.date(Number(x.timestamp), true) }))]),
        U.el('div', { 'class': 'row ex-nav' }, [copyBtn(x.txid, t('ex.copy.id'))])]),
      U.el('dl', { 'class': 'facts ex-facts' }, rows)];
    if (x.recipients && x.recipients.length) {
      kids.push(U.el('div', { 'class': 'display' }, [node('p', 'sub', t('ex.tx.paid', { n: U.num(x.recipients.length) })), recipientsTable(x.recipients, x.amount)]));
    }
    if (x.raw) {
      var code = node('pre', 'code wrapcode', x.raw);
      kids.push(U.el('div', { 'class': 'split ex-split' }, [
        U.el('div', { 'class': 'split-head' }, [node('h2', null, t('ex.txv.raw')), node('p', 'muted', t('ex.txv.raw.p')),
          link('#chain-accounts', t('ex.txv.how'))]),
        U.el('div', { 'class': 'code-wrap' }, [code, U.el('button', { type: 'button', 'class': 'copy', 'data-copy': '', text: t('ui.copy') })])]));
    }
    paint(kids, true);
    document.title = typeLabel(x) + ' ' + U.shortHash(x.txid, 8, 6) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  function showTx(id, quiet) {
    resolve({
      store: 'tx', key: id, path: '/tx/' + id,
      valid: function (j) { return !!j.txid; },
      open: function (j) { return j.status === 'pending'; },      // noch in keinem Block: mit jedem neuen Stand nachsehen
      again: true,                                                 // eben erst gesendet und noch nirgends bekannt: weiter nachsehen
      noneText: function () { return t('ex.none.tx'); },
      draw: drawTx
    }, quiet);
  }

  /* ---------- Ansicht: Adresse ---------- */
  var KIND = { 'in': 'ex.k.in', out: 'ex.k.out', reward: 'ex.k.reward', pool: 'ex.k.pool' };
  function drawAccount(acc) {
    var a = acc.address, first = acc.history || [], bal = acc.balance === null || acc.balance === undefined ? 0 : acc.balance;
    var waitingList = Array.isArray(acc.pending) ? acc.pending : [], top = first.length ? first[0].txid : '';
    // Schon nachgeladene ältere Bewegungen bleiben, solange sich vorn nichts getan hat
    if (!more[a] || more[a].top !== top) more[a] = { list: [], next: acc.historyWeiter || null, top: top };
    var hist = first.concat(more[a].list);
    function blockOrDash(h) { return h === null || h === undefined ? node('span', null, '–') : link('#explorer-block-' + h, t('ex.addr.blockN', { h: U.num(h) })); }
    function readout(k, v) {
      var val = node('span', 'v'); if (typeof v === 'string') val.textContent = v; else val.appendChild(v);
      return U.el('div', { 'class': 'readout' }, [node('span', 'k', k), val]);
    }
    var kids = [
      crumbs([{ text: t('ex.addr.h') }]),
      U.el('div', { 'class': 'ex-head' }, [U.el('div', {}, [
        node('p', 'ex-kicker muted', t('ex.addr.h')), node('h1', 'ex-title mono wrapany addr-title', a)]),
        U.el('div', { 'class': 'row ex-nav' }, [copyBtn(a, t('ex.copy.addr'))])])];
    if (a === ZERO) kids.push(U.el('div', { 'class': 'limit' }, [node('p', null, t('ex.addr.zero'))]));
    var empty = !hist.length && !waitingList.length && !Number(bal);
    var box = U.el('div', { 'class': 'display' }, [
      U.el('div', { 'class': 'readouts three' }, [
        U.el('div', { 'class': 'readout wide' }, [node('span', 'k', t('ex.addr.balance')), node('span', 'v', U.ysr(bal))]),
        readout(t('ex.addr.sent'), U.num(Number(acc.nonce) || 0)),
        readout(t('ex.addr.first'), blockOrDash(acc.firstHeight)),
        readout(t('ex.addr.last'), blockOrDash(acc.lastHeight)),
        readout(t('ex.addr.solo'), U.num(Number(acc.blocksFound) || 0)),
        readout(t('ex.addr.pool'), U.num(Number(acc.poolRewards) || 0))])]);
    kids.push(box);
    if (empty) kids.push(node('p', 'muted ex-none', t('ex.addr.none')));
    else if (hist.length || waitingList.length) {
      var rows = waitingList.map(function (e) {
        var out = e.kind === 'out', other = out ? e.to : e.from;
        return [node('span', 'muted', t('ex.addr.waiting')), null, link('#explorer-tx-' + e.txid, t(out ? 'ex.k.out' : 'ex.k.in')), other ? addr(other) : null,
          node('span', out ? 'neg' : 'pos', (out ? '−' : '+') + U.ysr(e.amount)), out ? U.ysr(e.fee || 0) : null];
      }).concat(hist.map(function (e) {
        var out = e.kind === 'out', label = KIND[e.kind] ? t(KIND[e.kind]) : String(e.kind);
        var amt = node('span', out ? 'neg' : 'pos', (out ? '−' : '+') + U.ysr(e.amount));
        return [link('#explorer-block-' + e.height, U.num(e.height), 'mono'), e.timestamp ? U.date(Number(e.timestamp), true) : null,
          link('#explorer-tx-' + e.txid, label), e.counterparty ? addr(e.counterparty) : null, amt,
          out ? U.ysr(e.fee || 0) : null];
      }));
      var histBox = U.el('div', { 'class': 'display' }, [
        U.el('div', { 'class': 'display-head' }, [node('h2', 'display-title', t('ex.addr.hist')), node('span', 'state', Live.values().modeShort)]),
        table([{ h: t('ex.h.block') }, { h: t('ex.h.when') }, { h: t('ex.h.what') }, { h: t('ex.h.with'), cls: 'short-addr' },
          { h: t('ex.h.amount'), cls: 'n' }, { h: t('ex.h.fee'), cls: 'n hide-m' }], rows, 'stack-s hist')]);
      if (more[a].next) {
        var btn = U.el('button', { type: 'button', 'class': 'btn small ghost', text: busyMore ? t('ex.older.busy') : t('ex.addr.older') });
        if (busyMore) btn.disabled = true;
        btn.addEventListener('click', function () { olderActivity(acc); });
        histBox.appendChild(U.el('div', { 'class': 'ex-foot' }, [node('p', 'fig-cap', t('ex.addr.more', { n: U.num(hist.length) })), btn]));
      }
      kids.push(histBox);
    }
    paint(kids, true);
    document.title = t('ex.addr.h') + ' ' + U.shortHash(a, 10, 6) + ' – ' + t('title.explorer') + ' – YSKAR';
  }
  /** Ältere Bewegungen einer Adresse nachladen (die API blättert mit einem Zeiger). */
  function olderActivity(acc) {
    var a = acc.address, m = more[a];
    if (busyMore || !m || !m.next) return;
    busyMore = true; if (cur.kind === 'address' && cur.a === a) drawAccount(acc);
    function done() { busyMore = false; if (cur.kind === 'address' && cur.a === a) drawAccount(acc); }
    api('/account/' + a + '/verlauf?limit=40&vor=' + encodeURIComponent(m.next)).then(function (r) {
      if (r.ok && r.j && Array.isArray(r.j.eintraege) && more[a] === m) { m.list = m.list.concat(r.j.eintraege); m.next = r.j.weiter || null; }
      done();
    }, done);
  }
  function showAddress(a, quiet) {
    resolve({
      store: 'acc', key: a, path: '/account/' + a,
      valid: function (j) { return !!j.address; },
      open: function (j) { return Array.isArray(j.pending) && j.pending.length > 0; },
      noneText: function () { return t('ex.msg.badAddr'); },
      draw: drawAccount
    }, quiet);
  }

  /* ---------- Suche ---------- */
  function search(q) {
    q = String(q || '').trim().replace(/^#/, '');
    if (!q) return void setMsg(t('ex.msg.empty'), true);
    var digits = q.replace(/[\s.,_']/g, ''), lower = q.toLowerCase().replace(/\s+/g, ''), c, h, tip = Live.S.summary.height;
    if (/^\d{1,9}$/.test(digits)) {
      h = +digits;
      if (h > tip) return void setMsg(t('ex.msg.tooHigh', { h: U.num(h), tip: U.num(tip) }), true);
      setMsg(''); return void go('block-' + h);
    }
    if (lower.slice(0, 3) === 'ysr') {
      c = checkAddress(lower);
      if (c !== 'ok') return void setMsg(t(c === 'sum' ? 'ex.msg.badAddr' : 'ex.msg.addrShape'), true);
      setMsg(''); return void go('adr-' + lower);
    }
    if (/^[0-9a-f]{64}$/.test(lower)) {
      h = heightOfHash(lower);
      if (h !== null) { setMsg(''); return void go('block-' + h); }
      if (cache.tx[lower]) { setMsg(''); return void go('tx-' + lower); }
      if (!live()) return void setMsg(t('ex.msg.offlineHash'), true);
      var my = ++searchToken; setMsg(t('ex.msg.searching'));
      return void api('/search?q=' + lower).then(function (r) {
        if (my !== searchToken) return;
        var j = r.j || {};
        if (j.kind === 'block') { setMsg(''); go('block-' + j.height); }
        else if (j.kind === 'tx') { setMsg(''); go('tx-' + j.txid); }
        else setMsg(t('ex.msg.notFound'), true);
      }, function () { if (my === searchToken) setMsg(t('ex.msg.offlineHash'), true); });
    }
    setMsg(t('ex.msg.empty'), true);
  }

  /* ---------- Wegweiser ---------- */
  function parse(rest) {
    var m;
    if (!rest) return { kind: 'home' };
    if ((m = /^block-(\d{1,9})$/.exec(rest))) return { kind: 'block', h: +m[1] };
    if ((m = /^(?:adr|address)-(ysr1[a-z0-9]{20,80})$/.exec(rest))) return { kind: 'address', a: m[1] };
    if ((m = /^tx-([0-9a-f]{64})$/.exec(rest))) return { kind: 'tx', id: m[1] };
    if (rest === 'neu') return { kind: 'next' };          // der Block, der gerade entsteht
    return { kind: 'home', unknown: true };
  }
  function render(quiet) {
    if (cur.kind === 'block') showBlock(cur.h, quiet);
    else if (cur.kind === 'next') showNext();
    else if (cur.kind === 'tx') showTx(cur.id, quiet);
    else if (cur.kind === 'address') {
      if (checkAddress(cur.a) !== 'ok') { cur.source = 'live'; none(t(checkAddress(cur.a) === 'sum' ? 'ex.msg.badAddr' : 'ex.msg.addrShape')); }
      else showAddress(cur.a, quiet);
    } else { token++; drawHome(); }
  }
  function onRoute(r) {
    if (r.page !== 'explorer') return;
    var key = r.rest || '', moved = shown !== null && key !== shown;
    cur = parse(key);
    setMsg(cur.unknown ? t('ex.msg.badLink') : '', !!cur.unknown);
    if (input && document.activeElement !== input && key !== shown) input.value = '';
    render();
    if (moved) window.scrollTo(0, 0);
    shown = key;
  }
  function init() {
    view = document.getElementById('ex-view'); if (!view) return;
    top = U.$('.ex-top'); input = document.getElementById('ex-q'); msgEl = document.getElementById('ex-msg');
    document.getElementById('ex-form').addEventListener('submit', function (e) { e.preventDefault(); search(input.value); });
    U.on('route', onRoute);
    U.on('lang', function () { render(false); });
    // Pfeiltasten blättern von Block zu Block; rechts vom neuesten liegt der Block im Bau
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      var el = document.activeElement, tag = el && el.tagName, tip = Live.S.summary.height, left = e.key === 'ArrowLeft';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable) || (el && el.closest && el.closest('.proof, [role="slider"], canvas, #menu'))) return;
      if (cur.kind === 'block') {
        if (left && cur.h > 0) go('block-' + (cur.h - 1));
        else if (!left && cur.h < tip) go('block-' + (cur.h + 1));
        else if (!left && live()) go('neu');
      } else if (cur.kind === 'next' && left) go('block-' + tip);
    });
    U.on('data', function () {
      var tip = Live.S.blocks[0].height, grown = tip !== viewTip;
      viewTip = tip;
      if (cur.kind === 'home') return void drawHome();
      if (cur.kind === 'next') return void showNext();
      // ein geöffneter Block bleibt offen; nur sein "nächster Block" zeigt jetzt auf einen gefundenen statt auf den im Bau
      if (cur.kind === 'block' && atTip && atTip.h === cur.h && tip > cur.h) { atTip.a.setAttribute('href', Router.href('#explorer-block-' + (cur.h + 1))); atTip = null; }
      // neu lesen, was sich noch ändern kann: wartende Zahlungen, ein Konto nach jedem neuen Block, alles nach einem Ausfall
      if (cur.kind === 'address' && grown && live()) delete cache.acc[cur.a];
      if (cur.pending || cur.open || (cur.source === 'snapshot' && live()) || (cur.kind === 'address' && grown && live())) render(cur.source !== 'snapshot' || !live());
    });
    viewTip = Live.S.blocks[0].height;
    onRoute(Router.parse());
  }
  return { init: init, checkAddress: checkAddress };
})();

/* ---- 32-dev.js ---- */
/*
 * API-Konsole der Entwicklerseite. Sie sendet die Anfrage wirklich (nur GET, nur lesend) und misst die Antwortzeit.
 * Gezeigt und kopiert wird die öffentliche Adresse der API; gefragt wird derselbe Rechner, der die Seite liefert.
 * Schlägt eine Anfrage fehl, zeigt sie die letzte Antwort, die die Seite dazu schon hat, und sagt das dazu.
 */
var Dev = (function () {
  'use strict';
  var ZERO = 'ysr1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqregwfw';
  var BURN = '7381a7bd87936682cf7daceaae077a2e5bba104d2629a43ec1df71d13275bca0';
  var EP, list, urlEl, metaEl, outEl, cur = 1 /* die Zusammenfassung zeigt schon der Seitenkopf */, token = 0, drawn = false;

  function endpoints() {
    var S = Live.S;
    return [
      { path: '/summary', d: 'dev.api.e.summary', last: function () { return S.summary; } },
      { path: '/blocks?limit=3', d: 'dev.api.e.blocks', last: function () { return { blocks: S.blocks.slice(0, 3) }; } },
      { path: '/blocks/0', d: 'dev.api.e.block' },
      { path: '/tx/' + BURN, short: '/tx/7381a7bd…', d: 'dev.api.e.tx' },
      { path: '/account/' + ZERO, short: '/account/ysr1qqqq…', d: 'dev.api.e.account' },
      { path: '/search?q=3974', d: 'dev.api.e.search' },
      { path: '/fees', d: 'dev.api.e.fees', last: function () { return S.fees; } },
      { path: '/pools', d: 'dev.api.e.pools', last: function () { return S.pools; } },
      { path: '/supply', d: 'dev.api.e.supply', last: function () { return S.supply; } },
      { path: '/supply/circulating', d: 'dev.api.e.circ', plain: true, last: function () { return String(S.supply.circulating); } }];
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  /** JSON lesbar setzen: Schlüssel gedämpft, Zeichenketten und Zahlen unterscheidbar. */
  function pretty(v) {
    var s = esc(JSON.stringify(v, null, 2));
    return s.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)\b/g, function (m, str, colon, lit) {
      if (str) return colon ? '<span class="jk">' + str + '</span>' + colon : '<span class="js">' + str + '</span>';
      return '<span class="jn">' + lit + '</span>';
    });
  }
  function show(body, plain) {
    if (plain) outEl.textContent = String(body); else outEl.innerHTML = pretty(body);
    outEl.scrollTop = 0;
  }
  function run() {
    var e = EP[cur], my = ++token, t0 = Date.now();
    urlEl.textContent = ''; urlEl.appendChild(U.el('span', { 'class': 'verb', text: 'GET' }));
    urlEl.appendChild(U.el('span', { 'class': 'base', text: ' ' + Live.PUBLIC }));
    urlEl.appendChild(U.el('span', { 'class': 'path', text: e.path }));
    U.$$('button', list).forEach(function (b, i) { b.setAttribute('aria-pressed', i === cur ? 'true' : 'false'); });
    metaEl.textContent = t('dev.api.busy'); metaEl.className = 'api-meta';
    fetch(Live.API + e.path, { cache: 'no-store' }).then(function (r) {
      if (r.status >= 500) throw new Error('HTTP ' + r.status);          // der Dienst selbst ist ausgefallen; 4xx ist eine Antwort der API
      return (e.plain ? r.text() : r.json()).then(function (body) {
        if (my !== token) return;
        show(body, e.plain);
        metaEl.textContent = t('dev.api.ok', { status: r.status + (r.ok ? ' OK' : ''), ms: U.num(Date.now() - t0) });
        metaEl.className = 'api-meta ok';
      });
    }).catch(function (err) {
      if (my !== token) return;
      var why = String((err && err.message) || err).slice(0, 60), last = e.last ? e.last() : null;
      if (last !== null && last !== undefined) { show(last, e.plain); metaEl.textContent = t('dev.api.fail', { why: why, date: U.date(Live.S.at, true) }); }
      else { outEl.textContent = ''; metaEl.textContent = t('dev.api.down', { why: why }); }
      metaEl.className = 'api-meta snap';
    });
  }
  function build() {
    list.textContent = '';
    EP.forEach(function (e, i) {
      var b = U.el('button', { type: 'button', 'aria-pressed': i === cur ? 'true' : 'false' }, [
        U.el('span', { 'class': 'p mono', text: e.short || e.path }), U.el('span', { 'class': 'd', text: t(e.d) })]);
      b.addEventListener('click', function () { cur = i; run(); });
      list.appendChild(b);
    });
  }
  function ensure() { if (Router.current() !== 'build') return; if (!drawn) { drawn = true; build(); run(); } }
  function init() {
    list = document.getElementById('api-list'); if (!list) return;
    urlEl = document.getElementById('api-url'); metaEl = document.getElementById('api-meta'); outEl = document.getElementById('api-out');
    EP = endpoints();
    document.getElementById('api-run').addEventListener('click', run);
    var curl = document.getElementById('api-curl');
    curl.addEventListener('click', function () { U.copyText('curl -s "' + Live.PUBLIC + EP[cur].path + '"', curl, t('ui.copied')); });
    U.on('lang', function () { if (drawn) { build(); run(); } });
    ensure();
  }
  return { init: init };
})();

/* ---- 41-sky.js ---- */
/*
 * Der Himmel über dem Fjord: drei Bänder aus Licht (WebGL) und die Lichter am Ufer.
 *
 * Das Foto liegt als <img> im Bild, das Licht wird darüber addiert. Damit Bänder hinter den Bergen
 * verschwinden und sich im Wasser spiegeln, kennt der Shader die Lage des Fotos (uSq) und eine kleine
 * Maske (Rot: Himmel, Grün: Wasser, Blau: Nebel).
 *
 * Die Lichter am Ufer sind kein Schmuck: ihre Zahl ist die Zahl der Knoten, die sich gerade gemeldet haben.
 */
var Sky = (function () {
  'use strict';
  // Ausschnitte des quadratischen Originals (2048 x 2048), wie tools/imgprep.py sie schneidet
  var CROP = { w: { x: 0, y: 396, w: 2048, h: 1366 }, p: { x: 448, y: 0, w: 1152, h: 2048 } }, SQ = 2048;
  var stage, inner, canvas, gl, prog, uni = {}, lightsBox, lights = [], wanted = 0;
  var geo = { left: 0, top: 0, size: 1, W: 1, H: 1 }, res = 0.5, raf = 0, onScreen = true, calm = false, ok = false;
  var state = { power: 0, reveal: 0, shift: 0, t0: 0 }, shiftTo = 0;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec3 uSq;uniform float uH;uniform float uT;uniform float uPower;uniform float uReveal;uniform float uShift;uniform sampler2D uMask;',
    'float hash(float n){return fract(sin(n)*43758.5453123);}',
    'float n1(float x){float i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(hash(i),hash(i+1.),f);}',
    'float fbm(float x){return n1(x)*.55+n1(x*2.03+11.3)*.3+n1(x*4.01+3.7)*.15;}',
    // ein Band: ein Vorhang aus Licht. Untere Kante scharf und hell, nach oben in feinen Strahlen ausklingend;
    // wo der Vorhang sich faltet (steile Kante), liegt mehr Licht hintereinander.
    'float edgeAt(float u,float t,float sd,float base,float amp){',
    ' return base+amp*(sin(u*10.5+t*.09+sd*2.3)+.5*sin(u*23.+sd*5.1-t*.13)+.1*sin(u*47.+t*.21+sd*9.))+.012*(fbm(u*14.+t*.15+sd*13.)-.5);}',
    // soft = 0: der Vorhang am Himmel; soft = 1: sein weiches Spiegelbild im Wasser (ohne Strahlen, breiter Saum)
    'vec3 band(float u,float h,float t,float sd,float base,float amp,float len,vec3 lo,vec3 hi,float soft){',
    ' float b=edgeAt(u,t,sd,base,amp);',
    ' float d=h-b;',
    ' if(d<-.06||d>len*2.4)return vec3(0.);',
    ' float fold=abs(edgeAt(u+.004,t,sd,base,amp)-b)/.004;',
    ' float rays=mix(pow(fbm(u*78.+t*.3+sd*31.),2.2)*2.1,.9,soft);',
    ' float clump=smoothstep(.3,.72,fbm(u*4.2-t*.04+sd*7.7));',
    ' float rev=smoothstep(0.,.4,uReveal*1.5-abs(u-.5-sd*.05)*1.2);',
    ' float reach=len*(.55+.75*rays);',
    ' float w=mix(.0085,.03,soft);',
    ' float body=smoothstep(-w,w,d)*exp(-max(d,0.)/reach*2.6)*(.2+.62*rays)*(.3+clump);',
    ' float hem=exp(-abs(d)/w)*(.3+.5*clump)*(.55+min(fold,2.)*.35)*mix(1.,.5,soft);',
    ' float fade=mix(smoothstep(.015,.075,h),1.,soft);',
    ' return (mix(lo,hi,clamp(d/len,0.,1.))*body+mix(lo,vec3(.72,.95,1.),.35)*hem)*rev*fade;}',
    'vec3 sky(float u,float h,float t,float soft){',
    ' vec3 c=band(u,h,t,1.,.115,.030,.10,vec3(.30,.84,1.),vec3(.14,.40,1.),soft);',
    ' c+=band(u,h,t,2.,.185,.036,.12,vec3(.22,.62,1.),vec3(.20,.24,.95),soft)*.85;',
    ' c+=band(u,h,t,3.,.250,.028,.09,vec3(.38,.90,.98),vec3(.16,.50,1.),soft)*.6;',
    ' return c*.85;}',
    'void main(){',
    ' vec2 px=vec2(gl_FragCoord.x,uH-gl_FragCoord.y);',
    ' vec2 uv=(px-uSq.xy)/uSq.z;',
    ' vec3 m=texture2D(uMask,clamp(uv,0.,1.)).rgb;',
    ' float t=uT;float u=uv.x+uShift;',
    ' vec3 c=sky(u,.555-uv.y,t,0.)*m.r;',
    // Spiegelung im Wasser: gestaucht, leicht verwackelt, schwächer
    ' if(m.g>.01){',
    '  float hw=(uv.y-.598)*1.15;',
    '  float ur=u+sin(uv.y*190.+t*1.1)*.004*(.4+hw*6.)+sin(uv.y*53.-t*.6)*.005;',
    '  c+=sky(ur,hw*.8+.04,t,1.)*m.g*.42*(1.-m.b*.4);',
    ' }',
    ' c*=uPower;',
    ' c+=(hash(px.x*.37+px.y*91.7+t)-.5)*.012*step(.004,c.g);',
    ' gl_FragColor=vec4(max(c,0.),0.);}'      // Alpha 0 mit vormultiplizierten Farben: das Licht wird zum Foto addiert
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
    return s;
  }
  function setupGL() {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ['uSq', 'uH', 'uT', 'uPower', 'uReveal', 'uShift', 'uMask'].forEach(function (n) { uni[n] = gl.getUniformLocation(prog, n); });
    var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    var img = new Image();
    img.onload = function () {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      draw(true);
    };
    img.src = Img.url('fjord-mask');
    gl.uniform1i(uni.uMask, 0);
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ok = false; });
    return true;
  }

  /** Lage des Fotos auf der Bühne (object-fit: cover, mittig). */
  function measure() {
    var W = inner.clientWidth, H = inner.clientHeight; if (!W || !H) return false;
    var c = CROP[Img.orient()], s = Math.max(W / c.w, H / c.h);
    geo.W = W; geo.H = H; geo.size = SQ * s;
    geo.left = (W - c.w * s) / 2 - c.x * s; geo.top = (H - c.h * s) / 2 - c.y * s;
    if (ok) {
      res = W > 900 ? 0.45 : 0.5;
      var cw = Math.max(2, Math.round(W * res)), ch = Math.max(2, Math.round(H * res));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      gl.viewport(0, 0, cw, ch);
    }
    place();
    return true;
  }
  function draw(force) {
    if (!ok || !gl) return;
    if (!force && state.power < 0.004) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    var t = calm ? 37.0 : (performance.now() - state.t0) / 1000 + 20;
    gl.uniform3f(uni.uSq, geo.left * res, geo.top * res, geo.size * res);
    gl.uniform1f(uni.uH, canvas.height); gl.uniform1f(uni.uT, t);
    gl.uniform1f(uni.uPower, state.power); gl.uniform1f(uni.uReveal, state.reveal); gl.uniform1f(uni.uShift, state.shift);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  var skip = false;
  function loop() {
    raf = 0;
    if (!onScreen || document.hidden || Router.current() !== 'home') return;
    skip = !skip;
    state.shift += (shiftTo - state.shift) * 0.05;
    if (!skip) draw();                       // jedes zweite Bild genügt: das Licht bewegt sich langsam
    raf = requestAnimationFrame(loop);
  }
  function wake() { if (!raf && ok && !calm) raf = requestAnimationFrame(loop); else if (calm) draw(true); }

  /* ---------- Lichter am Ufer ---------- */
  // feste Plätze am fernen Ufer (Anteile des quadratischen Originals), aus einem festen Zufallsstrom
  var SPOTS = (function () {
    var out = [], seed = 20260909, i;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    var groups = [[0.415, 0.05], [0.525, 0.032], [0.615, 0.045], [0.355, 0.022], [0.655, 0.018]];
    for (i = 0; i < 60; i++) {
      var g = groups[i % 3 === 0 ? (i % 5) : (i % 3)], x = g[0] + (rnd() + rnd() + rnd() - 1.5) * g[1] * 1.6;
      x = Math.min(0.672, Math.max(0.328, x));
      // das Ufer liegt in der Talmitte etwas höher (weiter weg) als an den Seiten
      var y = 0.5805 - 0.0045 * Math.exp(-Math.pow((x - 0.52) / 0.07, 2)) + (rnd() - 0.5) * 0.0045;
      out.push({ x: x, y: y, s: 0.75 + rnd() * 0.9, d: 2.2 + rnd() * 3.4, o: 0.72 + rnd() * 0.28 });
    }
    return out;
  })();
  function place() {
    lights.forEach(function (l) {
      var sp = l._sp;
      l.style.left = (geo.left + sp.x * geo.size).toFixed(1) + 'px';
      l.style.top = (geo.top + sp.y * geo.size).toFixed(1) + 'px';
    });
  }
  function setLights(n, animate) {
    if (!lightsBox) return;
    n = Math.max(0, Math.min(SPOTS.length - 1, n | 0));
    wanted = n;
    var unit = Math.max(2.7, Math.min(4.2, geo.size / 560));       // Lichtgröße folgt der Bildgröße
    while (lights.length < n + 1) {
      var sp = SPOTS[lights.length], el = document.createElement('i');
      el.className = 'light'; el._sp = sp;
      el.style.setProperty('--s', (unit * sp.s).toFixed(2) + 'px');
      el.style.setProperty('--d', sp.d.toFixed(2) + 's'); el.style.setProperty('--o', sp.o.toFixed(2));
      lightsBox.appendChild(el); lights.push(el);
    }
    place();
    lights.forEach(function (l, i) {
      var on = i < n, next = i === n;
      l.classList.toggle('is-next', next);
      if (!animate || calm) { l.classList.toggle('on', on); return; }
      if (on && !l.classList.contains('on')) setTimeout(function () { l.classList.add('on'); }, 500 + Math.random() * 2600);
      else if (!on) l.classList.remove('on');
    });
  }
  function nodes() { return Number(Live.S.summary.knoten || 0); }

  function init() {
    stage = document.getElementById('stage'); if (!stage) return;
    inner = U.$('.stage__inner', stage); canvas = document.getElementById('sky'); lightsBox = document.getElementById('lights');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    state.t0 = performance.now();
    try { ok = setupGL(); } catch (e) { ok = false; }
    stage.classList.toggle('no-gl', !ok);
    measure();
    if (calm) { state.power = 1; state.reveal = 1; }
    var ro = window.ResizeObserver ? new ResizeObserver(function () { measure(); draw(true); }) : null;
    if (ro) ro.observe(stage); else window.addEventListener('resize', function () { measure(); draw(true); });
    U.on('orient', function () { measure(); draw(true); });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (l) { onScreen = l[0].isIntersecting; if (onScreen) wake(); }).observe(stage);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    U.on('route', function (r) { if (r.page === 'home') { measure(); wake(); } });
    U.on('data', function () { if (lights.length) setLights(nodes(), true); });
    // Mauszeiger verschiebt die Bänder ein wenig (nur mit Maus)
    if (window.matchMedia && window.matchMedia('(pointer:fine)').matches && !calm) {
      window.addEventListener('pointermove', function (e) { shiftTo = (e.clientX / window.innerWidth - 0.5) * 0.03; }, { passive: true });
    }
    wake();
  }
  return {
    init: init, state: state, draw: draw, wake: wake, SPOTS: SPOTS,
    lightUp: function (animate) { setLights(nodes(), animate); },
    ok: function () { return ok; }
  };
})();

/* ---- 42-scenes.js ---- */
/*
 * Bewegung. Drei Arten, sonst keine:
 *  1. Der Auftakt der Startseite (einmal): Titel, Himmel, Lichter.
 *  2. An das Scrollen gebundene Szenen (GSAP ScrollTrigger): Bühne, Wörter die „angehen“, Morgengrauen.
 *  3. Einblenden beim Erscheinen (IntersectionObserver): [data-rise], [data-unveil], Zahlen mit [data-count].
 * Wer „Bewegung reduzieren“ eingestellt hat, sieht alles sofort und unbewegt.
 */
var Scenes = (function () {
  'use strict';
  var calm = false, introDone = false, hasGsap = false, io = null;

  /* ---------- Wörter einzeln ansprechbar machen ---------- */
  function split(root) {
    U.$$('[data-lit]', root || document).forEach(function (el) {
      if (el._split && el.querySelector('.w')) return;
      var words = el.textContent.trim().split(/[ \n\t]+/);     // geschützte Leerzeichen halten Zahl und Wort zusammen
      el.textContent = '';
      words.forEach(function (w, i) {
        var s = document.createElement('span'); s.className = 'w'; s.textContent = w; el.appendChild(s);
        if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      });
      el._split = true; el._n = words.length; el._k = -1;
      light(el, el._p || 0);
    });
  }
  function light(el, p) {
    el._p = p;
    var k = calm ? el._n : Math.min(el._n, Math.round(p * el._n * 1.1));
    if (k === el._k) return;
    var kids = el.children, i;
    for (i = 0; i < kids.length; i++) kids[i].classList.toggle('on', i < k);
    el._k = k;
  }

  /** Laternenweg: so viele Stufen leuchten, wie der Fortschritt hergibt; die Linie reicht bis zur letzten leuchtenden. */
  function path(ol, p) {
    var items = ol.children, k = Math.min(items.length, Math.round(p * items.length * 1.05)), i;
    if (k === ol._k) return;
    ol._k = k;
    for (i = 0; i < items.length; i++) items[i].classList.toggle('on', i < k);
    var last = items[Math.max(0, k - 1)], first = items[0], wide = last.offsetTop === first.offsetTop;
    ol.style.setProperty('--len', (k ? (wide ? last.offsetLeft - first.offsetLeft : last.offsetTop - first.offsetTop) : 0) + 'px');
  }

  /* ---------- Einblenden beim Erscheinen ---------- */
  function reveal() {
    var list = U.$$('[data-rise],[data-unveil],[data-count]');
    if (!('IntersectionObserver' in window) || calm) { list.forEach(show); return; }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { show(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    list.forEach(function (e) { io.observe(e); });
  }
  function show(e) {
    var d = e.getAttribute('data-delay');
    if (d) e.style.transitionDelay = d + 'ms';
    e.classList.add('in');
    if (e.hasAttribute('data-count')) count(e);
  }
  /** Zahl hochzählen: Ziel ist der fertig formatierte Live-Wert, gezählt werden nur die Ziffern. */
  function count(e) {
    var key = e.getAttribute('data-count'), v = Live.values()[key];
    if (v === undefined) return;
    e._counted = true;
    var target = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    if (calm || !hasGsap || !isFinite(target) || target < 3) { e.textContent = v; return; }
    var o = { n: 0 };
    gsap.to(o, { n: target, duration: 1.6, ease: 'power2.out', onUpdate: function () { e.textContent = U.num(Math.round(o.n)); }, onComplete: function () { e.textContent = Live.values()[key]; } });
  }
  function recount() { U.$$('[data-count]').forEach(function (e) { if (e._counted) { var v = Live.values()[e.getAttribute('data-count')]; if (v !== undefined) e.textContent = v; } }); }

  /* ---------- Auftakt ---------- */
  function intro() {
    if (introDone || Router.current() !== 'home') return;
    introDone = true;
    if (calm || !hasGsap) { Sky.state.power = 1; Sky.state.reveal = 1; Sky.lightUp(false); Sky.draw(true); return; }
    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.from('.hero__title .ln > span', { yPercent: 112, duration: 1.35, stagger: 0.13 }, 0.1)
      .from('.hero__lead', { opacity: 0, y: 20, duration: 1.1 }, 0.75)
      .from('.hero__cta > *', { opacity: 0, y: 16, duration: 0.9, stagger: 0.09 }, 0.95)
      .to(Sky.state, { power: 1, duration: 3.4, ease: 'power2.out' }, 0.15)
      .to(Sky.state, { reveal: 1, duration: 4.2, ease: 'power1.inOut' }, 0.15)
      .add(function () { Sky.lightUp(true); }, 1.1)
      .from('.hero__note', { opacity: 0, duration: 1.4 }, 2.3);
  }

  /* ---------- An das Scrollen gebundene Szenen ---------- */
  function scrub() {
    if (!hasGsap) return;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    var mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', function () {
      // Bühne: langsam näher, dunkler, sobald der Text darüber läuft
      if (document.getElementById('opening')) {
        gsap.timeline({ scrollTrigger: { trigger: '#opening', start: 'top top', end: 'bottom bottom', scrub: 0.6 } })
          .to({}, { duration: 1 }, 0)
          .to('.stage__inner', { scale: 1.16, ease: 'none', duration: 1 }, 0)
          .to('.hero__in', { opacity: 0, y: -70, ease: 'none', duration: 0.14 }, 0.03)
          .to('.hero__note', { opacity: 0, ease: 'none', duration: 0.06 }, 0)
          .to('.stage__scrim', { opacity: 1, ease: 'none', duration: 0.2 }, 0.1);
      }
      // Wörter gehen an
      U.$$('[data-lit]').forEach(function (el) {
        ScrollTrigger.create({ trigger: el, start: 'top 82%', end: 'bottom 46%', onUpdate: function (self) { light(el, self.progress); },
          onLeave: function () { light(el, 1); }, onLeaveBack: function () { light(el, 0); } });
      });
      // Morgengrauen: die Nacht blendet in die Dämmerung über
      U.$$('[data-dawn]').forEach(function (sec) {
        var dawn = U.$('.dawn__day', sec), txt = U.$('.dawn__txt', sec);
        if (!dawn) return;
        var tl = gsap.timeline({ scrollTrigger: { trigger: sec, start: 'top 75%', end: 'bottom bottom', scrub: 0.5 } });
        tl.fromTo(dawn, { opacity: 0 }, { opacity: 1, ease: 'none', duration: 0.7 }, 0)
          .fromTo(U.$('.dawn__stage', sec), { scale: 1.12 }, { scale: 1, ease: 'none', duration: 1 }, 0);
        if (txt) tl.fromTo(txt, { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: 'none', duration: 0.3 }, 0.55);
      });
      // Menschen: die Laternen gehen an, während der Abschnitt ins Bild kommt
      U.$$('.people__on').forEach(function (img) {
        gsap.fromTo(img, { opacity: 0 }, { opacity: 1, ease: 'none', scrollTrigger: { trigger: img.parentNode, start: 'top 70%', end: 'top -5%', scrub: 0.5 } });
      });
      // Laternenweg (Lab): Stufe für Stufe geht an
      U.$$('[data-path]').forEach(function (ol) {
        ScrollTrigger.create({ trigger: ol, start: 'top 80%', end: 'bottom 52%', onUpdate: function (self) { path(ol, self.progress); },
          onLeave: function () { path(ol, 1); }, onLeaveBack: function () { path(ol, 0); } });
      });
      // Wege: das überdeckte Bild tritt zurück
      U.$$('.ways').forEach(function (group) {
        U.$$('.door', group).forEach(function (w, i, all) {
          if (i === all.length - 1) return;
          gsap.to(U.$('.door__in', w), { scale: 0.94, opacity: 0.35, ease: 'none',
            scrollTrigger: { trigger: all[i + 1], start: 'top bottom', end: 'top top', scrub: true } });
        });
      });
      // Bilder mit leichter Tiefe
      U.$$('[data-drift] img').forEach(function (img) {
        gsap.fromTo(img, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: img.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
      });
    });
    mm.add('(prefers-reduced-motion: reduce)', function () { U.$$('[data-lit]').forEach(function (el) { light(el, 1); }); });
  }
  function refresh() { if (hasGsap && window.ScrollTrigger) ScrollTrigger.refresh(); }

  function init() {
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    hasGsap = !!(window.gsap && window.ScrollTrigger);
    split(document);
    scrub();
    reveal();
    U.on('lang', function () { split(document); setTimeout(refresh, 60); });
    U.on('route', function (r) { requestAnimationFrame(function () { refresh(); if (r.page === 'home') intro(); }); });
    U.on('layout', function () { setTimeout(refresh, 60); });
    U.on('data', recount);
    window.addEventListener('load', function () { refresh(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
    intro();
  }
  return { init: init, refresh: refresh, split: split };
})();

/* ---- 43-walk.js ---- */
/*
 * „Die Kette entlang“: Jeder Block seit Block 0 ist ein Licht, alle zusammen ein Band.
 * Beim Scrollen fährt die Kamera das Band entlang, an markanten Blöcken hält sie an.
 *
 * Die Daten sind echt: Abstand jedes Blocks zu seinem Vorgänger und ob er Überweisungen trug
 * (aus dem Verlauf der Kette, siehe 12-chain.js; neue Blöcke kommen live dazu). Der Abstand zweier
 * Lichter ist die Zeit zwischen zwei Blöcken.
 */
var Walk = (function () {
  'use strict';
  var K = 0.0035;                      // Pixel je Sekunde: ein Tag ist rund 300 Pixel lang
  var root, sticky, canvas, ctx, caps = [], hudH, hudD, tipBox;
  var T = [], F = [], Z = [], J = [], n = 0, t0 = 0, seen = -1;
  var W = 0, H = 0, dpr = 1, anchor = 0, cx = 0;
  var p = 0, cam = 0, camTo = 0, vel = 0, raf = 0, active = false, calm = false, started = false;
  var sprites = {}, vis = { x: [], y: [], i: [], n: 0 }, hover = -1, picked = -1, lastHud = '';
  var stops = [], tipSeen = false, fNow = 0, fTo = 0;     // { s: Ort am Band, el: Bildunterschrift }

  function rnd(i, salt) { var x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
  /**
   * Zeit und Merkmale jedes Blocks kommen aus dem Verlauf (12-chain.js). Hier kommt die Lage jedes Lichts dazu:
   * Tiefe (Z) und Abstand von der Mitte des Bandes (J); Blöcke mit Überweisungen liegen näher an der Mitte.
   * Liefert true, wenn sich seit dem letzten Aufruf etwas geändert hat.
   */
  function sync() {
    var c = Chain.get(), i;
    if (c.v === seen && c.n === n) return false;
    T = c.T; F = c.F; n = c.n; t0 = c.t0; seen = c.v;
    Z.length = J.length = n;
    for (i = 0; i < n; i++) {
      Z[i] = rnd(i, 1);
      J[i] = (rnd(i, 2) + rnd(i, 3) + rnd(i, 4) - 1.5) / 1.5 * ((F[i] & 4) ? 0.45 : 1);
    }
    return true;
  }
  function sAt(h) {                    // Ort eines Blocks am Band; jenseits der Spitze mit zehn Minuten je Block weitergedacht
    if (h <= n - 1) return T[Math.max(0, Math.round(h))] * K;
    return (T[n - 1] + (h - (n - 1)) * 600) * K;
  }
  function indexAt(s) {                // größter Block, dessen Ort <= s ist
    var t = s / K, lo = 0, hi = n - 1, mid;
    if (t <= 0) return 0;
    if (t >= T[n - 1]) return n - 1;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (T[mid] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function heightAtDate(ms) { var t = ms / 1000 - t0, i = indexAt(t * K); return i; }
  function wave(s) { var a = Math.min(W * 0.17, 210); return a * Math.sin(s / 1380) + a * 0.42 * Math.sin(s / 517 + 1.3); }
  function bandWidth(s) { return (W < 700 ? 30 : 46) * (0.75 + 0.5 * Math.sin(s / 2300 + 0.7) * Math.sin(s / 900)); }

  function sprite(r, g, b) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.13, 'rgba(' + r + ',' + g + ',' + b + ',.92)');
    grd.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',.24)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }

  function glowSprite() {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(70,135,255,.20)'); grd.addColorStop(0.45, 'rgba(50,110,255,.08)'); grd.addColorStop(1, 'rgba(40,100,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 128, 128);
    return c;
  }

  /* ---------- Haltepunkte ---------- */
  function buildStops() {
    var tip = n - 1;
    stops = caps.map(function (el) {
      var at = el.getAttribute('data-at'), h;
      if (at === 'start') return { s: sAt(0) - H * 0.34, el: el, h: 0, start: true };
      if (at === 'now') h = tip;
      else if (at.indexOf('date:') === 0) h = heightAtDate(Date.parse(at.slice(5)));
      else h = Number(at);
      el._h = h;
      return { s: sAt(h), el: el, h: h, future: h > tip };
    });
    stops.forEach(function (st) {
      var k = U.$('[data-k]', st.el);
      if (k && !st.start) {
        var txt = k.getAttribute('data-k');
        if (txt === 'block') k.textContent = t('walk.k.block', { h: U.num(st.h), d: U.date(t0 + (st.h <= tip ? T[st.h] : T[tip] + (st.h - tip) * 600)) });
        else if (txt === 'date') k.textContent = U.date(t0 + T[st.h]);
        else if (txt === 'now') k.textContent = Live.values().nowLine;
        else if (txt === 'future') k.textContent = t('walk.k.future', { h: U.num(st.h) });
      }
      var open = U.$('[data-open]', st.el);
      if (open) open.setAttribute('href', Router.href('#explorer-block-' + st.h));
      // Texte für „schon geschehen“, sobald die Kette an einem künftigen Haltepunkt vorbei ist
      U.$$('[data-when]', st.el).forEach(function (x) { x.hidden = (x.getAttribute('data-when') === 'future') !== !!st.future; });
    });
  }
  function ease(x) { x = Math.max(0, Math.min(1, (x - 0.2) / 0.6)); return x * x * x * (x * (6 * x - 15) + 10); }
  function camAt(q) {                  // q in 0..1 über alle Haltepunkte
    if (stops.length < 2) return stops.length ? stops[0].s : 0;
    var m = stops.length - 1, f = Math.max(0, Math.min(m, q * m)), i = Math.min(m - 1, Math.floor(f));
    return stops[i].s + (stops[i + 1].s - stops[i].s) * ease(f - i);
  }

  /* ---------- Zeichnen ---------- */
  function size() {
    var r = sticky.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(sticky.clientHeight));
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    anchor = H * (W < 700 ? 0.4 : 0.5); cx = W * (W < 900 ? 0.5 : 0.62);
  }
  function draw() {
    var tip = n - 1, sTip = T[tip] * K, top = cam - anchor / 0.82 - 60, bottom = cam + (H - anchor) / 0.82 + 60;
    var i0 = Math.max(0, indexAt(top) - 14), i1 = Math.min(tip, indexAt(bottom) + 14), i, z, s, x, y, r, a, k;
    var streak = Math.min(150, Math.abs(vel) * 0.9), unit = W < 700 ? 1.25 : 1.5;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    // der Schein des Bandes: weiche Lichtflecken entlang der Mitte, die ineinanderlaufen
    var from = Math.max(top, 60), to = Math.min(bottom, sTip), R = bandWidth(cam) * 3.6, stepG = 52;
    if (to > from) {
      ctx.globalAlpha = 0.34;
      for (s = Math.ceil(from / stepG) * stepG; s <= to; s += stepG) {
        ctx.drawImage(sprites.glow, cx + wave(s) - R, anchor + (s - cam) - R, R * 2, R * 2);
      }
      ctx.globalAlpha = 1;
    }
    // jenseits der Spitze: gestrichelte Bahn, wohin das Band noch wächst
    if (bottom > sTip) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.setLineDash([2, 9]);
      for (s = Math.max(sTip, top); s <= bottom; s += 20) { x = cx + wave(s); y = anchor + (s - cam); if (s === Math.max(sTip, top)) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.strokeStyle = 'rgba(190,212,255,.34)'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
      stops.forEach(function (st) {
        if (!st.future) return;
        x = cx + wave(st.s); y = anchor + (st.s - cam);
        if (y < -30 || y > H + 30) return;
        ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.2832); ctx.strokeStyle = 'rgba(255,196,122,.9)'; ctx.lineWidth = 1.4; ctx.stroke();
      });
      ctx.globalCompositeOperation = 'lighter';
    }

    vis.n = 0; tipSeen = false;
    for (i = i0; i <= i1; i++) {
      z = Z[i]; s = T[i] * K;
      y = anchor + (s - cam) * (0.82 + 0.36 * z);
      if (y < -30 || y > H + 30) continue;
      x = cx + wave(s) + J[i] * bandWidth(s) * (0.7 + z * 0.6);
      k = (F[i] & 4) ? 1 : 0;
      r = unit * (0.55 + z * 1.15) * (k ? 1.9 : 1);
      a = (0.3 + 0.7 * z) * Math.min(1, y / 70, (H - y) / 70);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.drawImage(k ? sprites.warm : sprites.cool, x - r * 3, y - r * 3 - streak * (0.4 + z) * 0.5, r * 6, r * 6 + streak * (0.4 + z));
      vis.x[vis.n] = x; vis.y[vis.n] = y; vis.i[vis.n] = i; vis.n++;
    }
    ctx.globalAlpha = 1;

    // markante Blöcke
    stops.forEach(function (st) {
      if (st.start || st.future) return;
      var yy = anchor + (st.s - cam), xx = cx + wave(st.s);
      if (yy < -40 || yy > H + 40) return;
      var isTip = st.h === tip, pulse = isTip && !calm ? 0.5 + 0.5 * Math.sin(performance.now() / 520) : 0.6;
      if (isTip) tipSeen = true;
      ctx.globalAlpha = 0.9; ctx.drawImage(isTip ? sprites.head : sprites.mark, xx - 22 - pulse * 8, yy - 22 - pulse * 8, 44 + pulse * 16, 44 + pulse * 16);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(xx, yy, 9 + pulse * 3, 0, 6.2832);
      ctx.strokeStyle = isTip ? 'rgba(255,214,160,.95)' : 'rgba(150,205,255,.85)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
    });
    // gewähltes Licht
    var sel = hover >= 0 ? hover : picked;
    if (sel >= 0 && sel <= tip) {
      z = Z[sel]; s = T[sel] * K; y = anchor + (s - cam) * (0.82 + 0.36 * z); x = cx + wave(s) + J[sel] * bandWidth(s) * (0.7 + z * 0.6);
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function hud() {
    var tip = n - 1, sTip = T[tip] * K, txt, d;
    if (cam <= 0) { txt = t('walk.hud.block', { h: '0' }); d = U.date(t0); }
    else if (cam > sTip + 6) {
      var h = Math.round(tip + (cam - sTip) / K / 600);
      txt = t('walk.hud.ahead', { h: U.num(h) }); d = t('walk.hud.planned');
    } else {
      var i = indexAt(cam), day = Math.floor(T[i] / 86400) + 1;
      txt = t('walk.hud.block', { h: U.num(i) }); d = U.date(t0 + T[i]) + ' · ' + t('walk.hud.day', { n: U.num(day) });
    }
    if (txt + d === lastHud) return;
    lastHud = txt + d; hudH.textContent = txt; hudD.textContent = d;
  }
  function captions() {
    stops.forEach(function (st, i) {
      var dist = Math.abs(fNow - i), o = dist <= 0.2 ? 1 : dist >= 0.47 ? 0 : 1 - (dist - 0.2) / 0.27;
      o = o * o * (3 - 2 * o);
      if (st._o !== undefined && Math.abs(o - st._o) < 0.004) return;
      st._o = o;
      st.el.style.opacity = o.toFixed(3);
      st.el.style.transform = 'translate3d(0,' + ((i - fNow) * 46).toFixed(1) + 'px,0)';
      st.el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
      st.el.classList.toggle('is-on', o > 0.5);
    });
  }
  function frame() {
    raf = 0;
    var d = camTo - cam, df = fTo - fNow;
    vel = Math.abs(d) < 0.3 ? 0 : d * 0.14;
    cam += vel === 0 ? d : vel;
    fNow += Math.abs(df) < 0.002 ? df : df * 0.14;
    if (vel === 0 && Math.abs(fTo - fNow) > 0.0001) vel = 0.0001;      // Bildunterschriften laufen noch nach
    draw(); hud(); if (!calm) captions();
    if (vel !== 0 && tipBox && !tipBox.hidden && picked >= 0) hideTip();
    if (active && (vel !== 0 || (tipSeen && !calm))) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ---------- Antippen ---------- */
  function nearest(px, py, max) {
    var best = -1, bd = max * max, i, dx, dy, d;
    for (i = 0; i < vis.n; i++) { dx = vis.x[i] - px; dy = vis.y[i] - py; d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  function showTip(v) {
    var i = vis.i[v], f = F[i];
    picked = i;
    U.$('[data-f="h"]', tipBox).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tipBox).textContent = (f & 8) ? t('walk.tip.approx') : U.date(t0 + T[i], true);
    U.$('[data-f="who"]', tipBox).textContent = (f & 8) ? '' : ((f & 3) === 0 ? t('walk.tip.solo') : t('walk.tip.pool')) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    U.$('a', tipBox).setAttribute('href', Router.href('#explorer-block-' + i));
    tipBox.hidden = false;
    var bw = tipBox.offsetWidth, bh = tipBox.offsetHeight, x = Math.max(12, Math.min(W - bw - 12, vis.x[v] - bw / 2)), y = vis.y[v] - bh - 16;
    if (y < 70) y = vis.y[v] + 18;
    tipBox.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px,0)';
    kick();
  }
  function hideTip() { if (tipBox) tipBox.hidden = true; picked = -1; }
  function pointer() {
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), v = nearest(e.clientX - r.left, e.clientY - r.top, 26);
      if (v < 0) { hideTip(); kick(); return; }
      showTip(v);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), v = nearest(e.clientX - r.left, e.clientY - r.top, 18), h = v < 0 ? -1 : vis.i[v];
      if (h !== hover) { hover = h; canvas.style.cursor = h < 0 ? '' : 'pointer'; kick(); }
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; kick(); } });
  }

  function setProgress(q) {
    p = q; camTo = camAt(q); fTo = q * (stops.length - 1);
    kick();
  }
  /** Mit „Bewegung reduzieren“ steht das Band am heutigen Stand der Kette. */
  function calmAt() {
    var i, at = -1;
    for (i = 0; i < stops.length; i++) if (stops[i].el.getAttribute('data-at') === 'now') at = i;
    return at < 0 || stops.length < 2 ? 0 : at / (stops.length - 1);
  }
  function layout() {
    if (!root || root.offsetParent === null) return;     // Seite nicht sichtbar: beim Seitenwechsel noch einmal
    size(); buildStops();
    if (calm) p = calmAt();
    camTo = camAt(p); fTo = p * (stops.length - 1);
    if (!started || calm) { cam = camTo; fNow = fTo; started = true; }
    kick();
  }

  function init() {
    root = document.getElementById('chain'); if (!root) return;
    sticky = U.$('.chainwalk__sticky', root); canvas = document.getElementById('walk'); ctx = canvas.getContext('2d');
    caps = U.$$('.walk-cap', root); hudH = document.getElementById('walk-h'); hudD = document.getElementById('walk-d'); tipBox = document.getElementById('walk-tip');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    sprites.glow = glowSprite(); sprites.cool = sprite(120, 190, 255); sprites.warm = sprite(255, 186, 110); sprites.mark = sprite(150, 215, 255); sprites.head = sprite(255, 226, 180);
    Chain.want(); sync();
    root.classList.toggle('is-calm', calm);
    layout();
    if (calm) { active = true; kick(); }
    else if (window.ScrollTrigger) {
      ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom bottom', onUpdate: function (self) { setProgress(self.progress); } });
      ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: function (self) { active = self.isActive; if (active) kick(); } });
    } else { active = true; }
    pointer();
    var ro = window.ResizeObserver ? new ResizeObserver(layout) : null;
    if (ro) ro.observe(sticky); else window.addEventListener('resize', layout);
    U.on('route', function (r) { if (r.page === 'home') setTimeout(layout, 30); });
    U.on('lang', function () { lastHud = ''; buildStops(); kick(); });
    U.on('data', function () { if (sync()) { buildStops(); camTo = camAt(p); } else buildStops(); kick(); });
  }
  return { init: init };
})();

/* ---- 44-prover.js ---- */
/*
 * „Prüf es selbst“: Das Gerät des Besuchers rechnet den Kopf eines Blocks nach (zweimal SHA-256)
 * und vergleicht das Ergebnis mit dem Ziel. Die Rechnung ist echt; nur das Einlaufen der Zeichen ist Inszenierung.
 */
var Prover = (function () {
  'use strict';
  var box, out, verdict, link, busy = false, calm = false, last = null;
  var HEX = '0123456789abcdef';

  function paint(hash, done) {
    out.textContent = '';
    var zeros = 0, i, row;
    if (done) while (zeros < 64 && hash[zeros] === '0') zeros++;
    for (i = 0; i < 64; i += 16) {
      row = U.el('span', { class: 'prover__row' });
      var part = hash.slice(i, i + 16), z = Math.max(0, Math.min(16, zeros - i));
      if (z) row.appendChild(U.el('b', { text: part.slice(0, z) }));
      row.appendChild(document.createTextNode(part.slice(z)));
      out.appendChild(row);
    }
  }
  function noise(fixed, real) {
    var s = '', i;
    for (i = 0; i < 64; i++) s += i < fixed ? real[i] : HEX[(Math.random() * 16) | 0];
    return s;
  }
  function say(res, which) {
    verdict.className = 'prover__verdict ' + (res.valid ? 'is-ok' : 'is-bad');
    var h = U.num(res.header.height);
    verdict.textContent = res.valid ? t('prove.ok', { h: h, ms: U.num(res.ms, res.ms < 0.01 ? 4 : 3) }) : t('prove.bad', { h: h });
    link.hidden = false; link.setAttribute('href', Router.href('#explorer-block-' + res.header.height));
    U.$('span', link).textContent = t('prove.open', { h: h });
  }
  function run(which) {
    if (busy) return;
    var hex = which === 'tip' ? (Live.S.blocks[0] && Live.S.blocks[0].header) : window.YSKAR_SNAPSHOT.genesis.header;
    if (!hex) return;
    var res = U.verifyHeader(hex);
    last = { res: res, which: which };
    box.classList.add('is-run'); verdict.textContent = ''; verdict.className = 'prover__verdict'; link.hidden = true;
    if (calm) { paint(res.hash, true); say(res, which); return; }
    busy = true;
    var start = performance.now(), total = 1500;
    (function tick() {
      var k = (performance.now() - start) / total;
      if (k >= 1) { paint(res.hash, true); say(res, which); busy = false; box.classList.add('is-done'); return; }
      paint(noise(Math.floor(Math.max(0, (k - 0.35) / 0.65) * 64), res.hash), false);
      requestAnimationFrame(tick);
    })();
  }
  function init() {
    box = document.getElementById('prover'); if (!box) return;
    out = document.getElementById('prover-hash'); verdict = document.getElementById('prover-verdict'); link = document.getElementById('prover-link');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    paint('················································································'.slice(0, 64), false);
    U.$$('[data-prove]', box).forEach(function (b) { b.addEventListener('click', function () { run(b.getAttribute('data-prove')); }); });
    U.on('lang', function () { if (last && !busy) say(last.res, last.which); });
  }
  return { init: init };
})();

/* ---- 45-early.js ---- */
/* Sätze aus Live-Zahlen (<p data-lit data-say="schluessel">) und der Stand der laufenden Epoche. */
var Early = (function () {
  'use strict';
  function paint() {
    var v = Live.values();
    U.$$('[data-say]').forEach(function (el) {
      // ohne Verbindung (mitgeführter Stand) gilt, wo vorhanden, die Fassung "<schluessel>.snap": Vergangenheit statt "gerade"
      var key = el.getAttribute('data-say'), snap = key + '.snap';
      if (Live.S.mode !== 'live' && I18n.has(snap)) key = snap;
      var s = t(key, { d: v.day, n: v.nodes, m: v.miners, p: v.poolCount, x: v.transfers, k: v.nodesNext, h: v.height, a: v.tipAgeLong, r: v.hashrate, date: v.snapDate });
      if (el._txt !== s) { el._txt = s; el.textContent = s; el._split = false; Scenes.split(el.parentNode); }
    });
    U.$$('[data-era-fill]').forEach(function (f) { f.style.width = v.eraPct.replace(/\s/g, ''); });
  }
  function init() {
    paint(); U.on('data', paint); U.on('lang', paint);
    // Netz-Seite: die Zeitachse der letzten Stunden als eigenes Exemplar
    var box = document.getElementById('net-pulse');
    if (box && window.Pulse) box.appendChild(Pulse.make().set({ mode: 'tip' }));
  }
  return { init: init };
})();

/* ---- 46-trymine.js ---- */
/*
 * „Raten starten“: Das Gerät des Besuchers sucht auf dem echten Kopf des neuesten Blocks nach einer Nonce,
 * gegen ein leichtes Übungsziel (der Hash muss mit 20 Null-Bits beginnen). Danach steht da, wie lange
 * dasselbe Gerät im Mittel für einen echten Block bräuchte. Gerechnet wird wirklich; die Funken sind die Anzeige dazu.
 */
var TryMine = (function () {
  'use strict';
  var BITS = 20, CAP = 14000000, running = false, stop = false, lastRate = 0, last = null, calm = false;
  var canvas, ctx, W = 0, H = 0, dpr = 1, sparks = [], flash = 0, raf = 0;

  function $(id) { return document.getElementById(id); }
  function targetWords() {
    var one = (BigInt(1) << BigInt(256 - BITS)) - BigInt(1), s = one.toString(16), w = new Int32Array(8), i;
    while (s.length < 64) s = '0' + s;
    for (i = 0; i < 8; i++) w[i] = parseInt(s.substr(i * 8, 8), 16) | 0;
    return w;
  }
  function duration(sec) {
    if (!isFinite(sec)) return '–';
    var n;
    if (sec < 120) { n = Math.max(1, Math.round(sec)); return tn('dur.sec', n, { n: U.num(n) }); }
    if (sec < 7200) { n = Math.round(sec / 60); return tn('dur.min', n, { n: U.num(n) }); }
    if (sec < 172800) { n = Math.round(sec / 3600); return tn('dur.hours', n, { n: U.num(n) }); }
    if (sec < 730 * 86400) { n = Math.round(sec / 86400); return tn('dur.days', n, { n: U.num(n) }); }
    var y = sec / (365.25 * 86400);
    if (y >= 1e6) return t('dur.years.big', { n: U.compact(y, 1) });
    n = y < 10 ? Math.round(y * 10) / 10 : Math.round(y);
    return tn('dur.years', n, { n: U.num(n, 1) });
  }
  function hashWithNonce(header, n) {
    var b = new Uint8Array(header), lo = n >>> 0, hi = Math.floor(n / 4294967296) >>> 0;
    b[128] = lo & 255; b[129] = (lo >>> 8) & 255; b[130] = (lo >>> 16) & 255; b[131] = lo >>> 24;
    b[132] = hi & 255; b[133] = (hi >>> 8) & 255; b[134] = (hi >>> 16) & 255; b[135] = hi >>> 24;
    return U.bytesToHex(Sha.twice(b));
  }
  function showHash(hex) {
    var box = $('try-hash'), z = 0; box.textContent = '';
    while (z < 64 && hex[z] === '0') z++;
    if (z) box.appendChild(U.el('b', { text: hex.slice(0, z) }));
    box.appendChild(document.createTextNode(hex.slice(z)));
  }
  function say(kind, n) {
    var s = $('try-say'), r = $('try-real');
    last = kind ? { kind: kind, n: n } : null;
    s.className = 'try__say' + (kind === 'found' ? ' is-ok' : '');
    s.textContent = !kind ? t('mine.try.idle') : t('mine.try.' + kind, { n: U.num(n) });
    if (kind && lastRate) {
      var diff = Number(Live.S.summary.difficultyWert || Live.S.summary.difficulty), work = diff * 65536;
      r.textContent = t('mine.try.real', { x: U.compact(work / Math.pow(2, BITS), 0), r: U.hashrate(lastRate), t: duration(work / lastRate) });
    } else r.textContent = '';
    $('try-go').textContent = running ? t('mine.try.stop') : (kind ? t('mine.try.again') : t('mine.try.go'));
  }

  /* ---------- Funken ---------- */
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  function emit(k) {
    if (calm) return;
    for (var i = 0; i < k && sparks.length < 260; i++) {
      var a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, v = 1.5 + Math.random() * 4.2;
      sparks.push({ x: W / 2 + (Math.random() - 0.5) * 30, y: H * 0.78, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, d: 0.012 + Math.random() * 0.02 });
    }
    if (!raf) raf = requestAnimationFrame(draw);
  }
  function draw() {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var i, s;
    for (i = sparks.length - 1; i >= 0; i--) {
      s = sparks[i]; s.x += s.vx; s.y += s.vy; s.vy += 0.035; s.life -= s.d;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = s.life * 0.9;
      ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.arc(s.x, s.y, 1.1 + s.life * 1.3, 0, 6.2832); ctx.fill();
    }
    if (flash > 0) {
      var g = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.6 * (1.15 - flash * 0.5));
      g.addColorStop(0, 'rgba(255,226,180,' + (flash * 0.95).toFixed(3) + ')'); g.addColorStop(0.35, 'rgba(255,186,110,' + (flash * 0.4).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,186,110,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      flash -= 0.012;
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (sparks.length || flash > 0) raf = requestAnimationFrame(draw);
  }

  function run() {
    var tip = Live.S.blocks[0]; if (!tip || !tip.header) return;
    var header = U.hexToBytes(tip.header), search = Sha.makeSearch(header), target = targetWords();
    var next = Math.floor(Math.random() * 4000000000), tried = 0, chunk = 4000;
    var clock = (window.performance && performance.now) ? function () { return performance.now(); } : Date.now, t0 = clock();
    running = true; stop = false; flash = 0; say(null); size();
    (function step() {
      var c0 = clock(), r = search(next, chunk, target), dt = clock() - c0;
      tried += r.tried; next += chunk;
      lastRate = tried / Math.max((clock() - t0) / 1000, 0.001);
      $('try-n').textContent = U.num(tried); $('try-rate').textContent = U.hashrate(lastRate);
      if (r.nonce >= 0) { showHash(hashWithNonce(header, r.nonce)); return done('found', tried); }
      showHash(hashWithNonce(header, next - 1)); emit(5);
      if (stop) return done(null, tried);
      if (tried >= CAP) return done('none', tried);
      if (dt < 24) chunk = Math.min(chunk * 2, 300000); else if (dt > 60) chunk = Math.max(2000, Math.floor(chunk / 2));
      setTimeout(step, 0);
    })();
    function done(kind, n) {
      running = false;
      if (kind === 'found') { flash = 1; emit(60); if (!raf) raf = requestAnimationFrame(draw); }
      say(kind, n);
    }
  }
  function init() {
    if (!$('trymine')) return;
    canvas = $('try-canvas'); ctx = canvas.getContext('2d');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    $('try-go').addEventListener('click', function () { if (running) stop = true; else run(); });
    U.on('lang', function () { say(last ? last.kind : null, last ? last.n : 0); });
    U.on('route', function (r) { if (r.page !== 'mine' && running) stop = true; });
    showHash('????????????????????????????????????????????????????????????????'.replace(/\?/g, '·'));
    say(null);
  }
  return { init: init };
})();

/* ---- 47-supply.js ---- */
/* YSR-Seite: Menge als Lichtband und die Epochen als Balken. Alle Werte aus der Kette bzw. aus den Konsensregeln. */
var Supply = (function () {
  'use strict';
  function paint() {
    var S = Live.S, max = Number(S.summary.maxSupply), minted = Number(S.summary.totalSupply), burned = parseFloat(S.supply.unspendable) * U.UNIT;
    var m = document.getElementById('supply-mined'); if (!m) return;
    m.style.width = (minted / max * 100).toFixed(2) + '%';
    document.getElementById('supply-burned').style.width = (burned / max * 100).toFixed(2) + '%';
    document.getElementById('supply-open').textContent = U.num((max - minted) / U.UNIT, 0) + ' YSR';
    var box = document.getElementById('eras'), h = S.summary.height, era = Math.floor(h / U.EPOCH), first = 10500000, i, rest = 21000000;
    box.textContent = '';
    for (i = 0; i < 8; i++) {
      var amount = first / Math.pow(2, i); rest -= amount;
      box.appendChild(U.el('div', { class: 'eras__row' + (i === era ? ' is-now' : '') }, [
        U.el('span', { text: t('coin.eras.era', { n: i + 1 }) + (i === era ? ' · ' + t('coin.eras.now') : '') }),
        U.el('i', { style: 'width:' + (amount / first * 100).toFixed(2) + '%' }),
        U.el('b', { text: U.num(amount, 0) })
      ]));
    }
    box.appendChild(U.el('div', { class: 'eras__row' }, [U.el('span', { text: '9+' }), U.el('i', { style: 'width:' + (rest / first * 100).toFixed(2) + '%' }), U.el('b', { text: U.num(rest, 0) })]));
    box.appendChild(U.el('p', { class: 'micro faint', text: t('coin.eras.rest') }));
  }
  function init() { if (!document.getElementById('supply')) return; paint(); U.on('data', paint); U.on('lang', paint); }
  return { init: init };
})();

/* ---- 48-steps.js ---- */
/*
 * Scroll-Szene mit stehender Bühne: <section class="story"> … <div class="story__cap">…</div> … </section>
 * Beim Scrollen wechselt die Aussage; die Bühne bekommt den Stand als Zahl f (0 = erste Aussage, n-1 = letzte).
 * Mit „Bewegung reduzieren“ stehen alle Aussagen untereinander und die Bühne zeigt den Endzustand.
 */
var Steps = (function () {
  'use strict';
  function mount(root, onFrame, opt) {
    opt = opt || {};
    var caps = U.$$('.story__cap', root), n = caps.length, fNow = 0, fTo = 0, raf = 0, active = false;
    var calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var api = { f: 0, n: n, calm: calm, kick: kick, active: function () { return active; } };
    function paintCaps() {
      caps.forEach(function (el, i) {
        var d = Math.abs(fNow - i), o = d <= 0.2 ? 1 : d >= 0.47 ? 0 : 1 - (d - 0.2) / 0.27;
        o = o * o * (3 - 2 * o);
        if (el._o !== undefined && Math.abs(o - el._o) < 0.004) return;
        el._o = o; el.style.opacity = o.toFixed(3);
        el.style.transform = 'translate3d(0,' + ((i - fNow) * 46).toFixed(1) + 'px,0)';
        el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
        el.classList.toggle('is-on', o > 0.5);
      });
    }
    function frame() {
      raf = 0;
      var d = fTo - fNow, moving = Math.abs(d) > 0.0015;
      fNow += moving ? d * 0.14 : d;
      api.f = fNow;
      if (!calm) paintCaps();
      var again = onFrame(fNow, api) === true;
      if (active && (moving || again)) raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }
    root.classList.toggle('is-calm', calm);
    if (calm) { fNow = fTo = opt.calmAt !== undefined ? opt.calmAt : n - 1; active = true; kick(); }
    else if (window.ScrollTrigger) {
      ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom bottom', onUpdate: function (s) { fTo = s.progress * (n - 1); kick(); } });
      ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onToggle: function (s) { active = s.isActive; if (active) kick(); } });
    } else { active = true; kick(); }
    var sticky = U.$('.story__sticky', root);
    if (window.ResizeObserver && sticky) new ResizeObserver(function () { if (opt.onSize) opt.onSize(); kick(); }).observe(sticky);
    U.on('route', function () { setTimeout(function () { if (opt.onSize) opt.onSize(); kick(); }, 40); });
    U.on('lang', kick); U.on('data', kick);
    return api;
  }
  return { mount: mount };
})();

/* ---- 49-field.js ---- */
/*
 * YSR als Lichtfeld: 21 Millionen YSR, jedes Licht steht für 1.000 (schmal: 2.000) YSR, in der Reihenfolge ihrer Entstehung.
 * Geschürft = leuchtet, verbrannt = Glut, noch nicht geschürft = dunkel. Werte aus der Kette und aus den Konsensregeln.
 */
var Field = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, unit = 1000, N = 21000, cols = 1, cell = 4, ox = 0, oy = 0, rows = 1, api;

  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var wide = W >= 900;
    unit = W < 700 ? 2000 : 1000; N = 21000000 / unit;
    // Fläche für das Feld: breit rechts neben dem Text, schmal über dem Text
    var ax = wide ? W * 0.44 : 20, aw = wide ? W * 0.56 - 56 : W - 40, ay = wide ? H * 0.16 : 118, ah = wide ? H * 0.7 : H * 0.44;
    cell = Math.floor(Math.sqrt(aw * ah / N) * 100) / 100;
    cols = Math.max(10, Math.floor(aw / cell)); rows = Math.ceil(N / cols);
    while (rows * cell > ah && cell > 1) { cell -= 0.05; cols = Math.floor(aw / cell); rows = Math.ceil(N / cols); }
    ox = ax + (aw - cols * cell) / 2; oy = ay + (ah - rows * cell) / 2;
    U.$$('[data-field-unit]', root).forEach(function (e) { e.textContent = U.num(unit); });
  }
  function band(from, to, color, alpha) {
    if (to <= from) return;
    var d = Math.max(1, cell * 0.62), i, x, y, r0 = Math.floor(from / cols), r1 = Math.floor((to - 1) / cols), row, a, b;
    ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath();
    for (row = r0; row <= r1; row++) {
      a = row === r0 ? from - row * cols : 0; b = row === r1 ? to - row * cols : cols;
      y = oy + row * cell;
      for (i = a; i < b; i++) { x = ox + i * cell; ctx.rect(x, y, d, d); }
    }
    ctx.fill();
  }
  function draw(f) {
    var S = Live.S, max = Number(S.summary.maxSupply), minted = Number(S.summary.totalSupply) / max * N, burned = parseFloat(S.supply.unspendable) * U.UNIT / max * N;
    var k = function (a, b) { return Math.max(0, Math.min(1, (f - a) / (b - a))); };
    var lit = Math.round(minted * k(0.25, 1)), ash = Math.round(burned * k(1.3, 2)), era = k(2.3, 3), halv = k(3.3, 4);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    band(0, N, '#8FB4FF', 0.13);                                       // alles, was es je geben wird
    if (halv > 0) {                                                    // Epochen als abwechselnd hellere Bänder
      var start = 0, e, len = N / 2;
      for (e = 0; e < 9 && len >= 1; e++) { if (e % 2 === 0) band(Math.round(start), Math.round(start + len), '#8FB4FF', 0.13 * halv); start += len; len /= 2; }
    }
    if (era > 0) band(0, Math.round(N / 2), '#63D8FF', 0.16 * era * (1 - halv * 0.6));
    band(0, lit, '#6FB6FF', 0.95);                                     // geschürft
    if (ash > 0) { band(0, ash, '#020510', 1); band(0, ash, '#FF9B5C', 0.9 - 0.55 * k(1.7, 2.4)); }
    // Rahmen um die erste Epoche
    if (era > 0.02) {
      var rr = Math.ceil(N / 2 / cols);
      ctx.globalAlpha = era * (1 - halv * 0.5); ctx.strokeStyle = '#FFC47A'; ctx.lineWidth = 1.2;
      ctx.strokeRect(ox - 5, oy - 5, cols * cell + 8, rr * cell + 8);
    }
    ctx.globalAlpha = 1;
  }
  function init() {
    root = document.getElementById('field'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d');
    size();
    api = Steps.mount(root, function (f) { draw(f); return false; }, { onSize: size });
  }
  return { init: init };
})();

/* ---- 50-phone.js ---- */
/* Wallet-Seite: Handy mit echten Bildschirmen (wechseln beim Scrollen) und die zwölf Zeilen, die sich schreiben. */
var Phone = (function () {
  'use strict';
  function words() {
    var list = document.getElementById('words'); if (!list) return;
    var seed = 12, i, k;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    for (i = 1; i <= 12; i++) {
      // eine unleserliche Handschriftzeile: Bögen und Schlaufen entlang einer Grundlinie
      var x = 2, d = 'M2 17', letters = 4 + Math.floor(rnd() * 5);
      for (k = 0; k < letters; k++) {
        var w = 7 + rnd() * 8, h = 6 + rnd() * 11, up = rnd() > 0.25;
        d += ' q' + (w * 0.3).toFixed(1) + ' ' + (up ? -h : h * 0.4).toFixed(1) + ' ' + (w * 0.55).toFixed(1) + ' ' + (rnd() * 3 - 1.5).toFixed(1);
        d += ' q' + (w * 0.2).toFixed(1) + ' ' + (up ? h * 0.5 : -h * 0.3).toFixed(1) + ' ' + (w * 0.45).toFixed(1) + ' 0';
        x += w;
      }
      var li = document.createElement('li'), n = document.createElement('span');
      n.textContent = i;
      li.appendChild(n);
      li.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 ' + Math.ceil(x + 6) + ' 24" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path pathLength="1" d="' + d + '" style="transition-delay:' + (i * 90) + 'ms"/></svg>');
      list.appendChild(li);
    }
  }
  function init() {
    words();
    var root = document.getElementById('screens'); if (!root) return;
    var imgs = U.$$('.phone img', root), cur = -1;
    Steps.mount(root, function (f) {
      var i = Math.max(0, Math.min(imgs.length - 1, Math.round(f)));
      if (i !== cur) { cur = i; imgs.forEach(function (im, k) { im.classList.toggle('is-on', k === i); }); }
      return false;
    }, { calmAt: 0 });
  }
  return { init: init };
})();

/* ---- 51-pay.js ---- */
/*
 * Mining-Seite, Szene „Der Block zahlt aus“: Viele raten, eine Zahl passt, der Block bezahlt alle Beteiligten.
 * Die Zahl der bezahlten Adressen ist die des neuesten Pool-Blocks der Kette.
 */
var Pay = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, pts = [], cx = 0, cy = 0, R = 0;

  function rnd(i, s) { var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    var wide = W >= 900;
    cx = wide ? W * 0.7 : W * 0.5; cy = wide ? H * 0.5 : H * 0.33; R = Math.min(wide ? W * 0.24 : W * 0.4, H * (wide ? 0.36 : 0.24));
    pts = [];
    for (var i = 0; i < 170; i++) {
      var a = rnd(i, 1) * 6.2832, d = Math.sqrt(rnd(i, 2)) * R * 1.45;
      pts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.82, p: rnd(i, 3) * 6.2832, s: 0.6 + rnd(i, 4) * 1.5, v: 0.8 + rnd(i, 5) * 2.4 });
    }
  }
  function paid() {
    var b = Live.S.blocks, i;
    for (i = 0; i < b.length; i++) if ((b[i].recipients || 1) > 1) return { n: Number(b[i].recipients), h: b[i].height };
    return { n: 16, h: null };
  }
  function draw(f, api) {
    var t = performance.now() / 1000, k = function (a, b) { return Math.max(0, Math.min(1, (f - a) / (b - a))); };
    var gather = k(0.5, 1), block = k(0.85, 1.15), rays = k(1.3, 1.95), fade = k(2.3, 3), i, p, x, y, a;
    var info = paid(), n = Math.min(info.n, 40);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    // Versuche: funkelnde Punkte, die sich zur Mitte sammeln
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var e = gather * gather;
      x = p.x + (cx - p.x) * e; y = p.y + (cy - p.y) * e;
      a = (0.25 + 0.75 * Math.abs(Math.sin(t * p.v + p.p))) * (1 - gather * 0.92);
      if (a < 0.02) continue;
      ctx.globalAlpha = api.calm ? 0.5 * (1 - gather) : a; ctx.fillStyle = '#9CCBFF';
      ctx.beginPath(); ctx.arc(x, y, p.s, 0, 6.2832); ctx.fill();
    }
    // der Fund
    if (block > 0) {
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 120);
      g.addColorStop(0, 'rgba(255,214,160,' + (0.5 * block * (1 - fade * 0.5)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(255,186,110,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.fillRect(cx - 120, cy - 120, 240, 240);
    }
    ctx.globalCompositeOperation = 'source-over';
    // Auszahlung: Strahlen vom Block zu jeder bezahlten Adresse
    if (rays > 0) {
      for (i = 0; i < n; i++) {
        var ang = -Math.PI / 2 + i / n * 6.2832, d0 = 38, d1 = R * (0.86 + 0.14 * rnd(i, 9));
        var reach = Math.max(0, Math.min(1, rays * 1.5 - i / n * 0.5)), x0 = cx + Math.cos(ang) * d0, y0 = cy + Math.sin(ang) * d0;
        x = cx + Math.cos(ang) * (d0 + (d1 - d0) * reach); y = cy + Math.sin(ang) * (d0 + (d1 - d0) * reach);
        ctx.globalAlpha = 0.5 * (1 - fade * 0.75); ctx.strokeStyle = '#FFC47A'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
        if (reach >= 1) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#FFE0B0';
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 6.2832); ctx.fill();
          ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, 8, 0, 6.2832); ctx.fill();
        }
      }
    }
    if (block > 0) {
      var s = 30 * (0.6 + 0.4 * block);
      ctx.globalAlpha = block; ctx.fillStyle = '#0B1630'; ctx.strokeStyle = '#FFD9A6'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - s, cy - s, s * 2, s * 2, 12); else ctx.rect(cx - s, cy - s, s * 2, s * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var out = document.getElementById('pay-n'); if (out && out.textContent !== String(info.n)) out.textContent = U.num(info.n);
    return !api.calm && f < 1.2;          // solange gefunkelt wird, weiterzeichnen
  }
  function init() {
    root = document.getElementById('pay'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d'); size();
    Steps.mount(root, draw, { onSize: size });
  }
  return { init: init };
})();

/* ---- 52-pools.js ---- */
/* Mining-Seite: die Pools des öffentlichen Verzeichnisses als Zeilen, mit ihrem Anteil an den letzten Blöcken der Kette. */
var Pools = (function () {
  'use strict';
  function paint() {
    var box = document.getElementById('pools-live'); if (!box) return;
    var b = Live.S.blocks.slice(0, 50), n = b.length, finds = {};
    b.forEach(function (x) { var f = x.finder || ''; finds[f] = (finds[f] || 0) + 1; });
    var pools = (Live.S.pools.pools || []).slice().sort(function (a, c) { return (finds[c.kette || c.name] || 0) - (finds[a.kette || a.name] || 0); });
    box.textContent = '';
    pools.forEach(function (p) {
      var found = finds[p.kette || p.name] || 0, full = p.status !== 'offen';
      box.appendChild(U.el('div', { class: 'pool' }, [
        U.el('div', { class: 'pool__top' }, [U.el('span', { class: 'pool__name', text: p.name }), U.el('span', { class: 'pool__host', text: p.host })]),
        U.el('div', { class: 'pool__bar' }, [U.el('i', { style: 'width:' + (n ? found / n * 100 : 0).toFixed(1) + '%' })]),
        U.el('p', { class: 'pool__meta' }, [
          U.el('span', {}, [U.el('b', { text: U.num(found) + ' / ' + U.num(n) }), ' ' + t('poolsx.last')]),
          U.el('span', {}, [U.el('b', { text: U.num(p.feeBps / 100, 2) + ' %' }), ' ' + t('poolsx.fee')]),
          U.el('span', {}, [U.el('b', { text: U.num(p.belegt) + ' / ' + U.num(p.plaetze) }), ' ' + t('poolsx.seats') + (full ? ' (' + t('pools.full') + ')' : '')]),
          U.el('span', {}, [U.el('b', { text: p.hashrate > 0 ? U.hashrate(p.hashrate) : '–' }), ' ' + t('poolsx.rate')])
        ])
      ]));
    });
    var cap = document.getElementById('pools-live-cap'); if (cap) cap.textContent = t('pools.cap', { n: U.num(n) });
  }
  function init() { if (!document.getElementById('pools-live')) return; paint(); U.on('data', paint); U.on('lang', paint); }
  return { init: init };
})();

/* ---- 53-shore.js ---- */
/*
 * Knoten-Seite: das Ufer aus dem Titelbild als eigene Szene, mit einem Licht je gemeldetem Knoten.
 * Der Knopf zeigt, wie es mit einem weiteren aussähe. Das ist nur eine Vorschau auf dem Bildschirm des Besuchers und zählt nichts hoch.
 * Dazu: die Laternenfotos der Community (aus → an).
 */
var Shore = (function () {
  'use strict';
  // Ausschnitte der beiden Bildfassungen im quadratischen Original (siehe tools/imgprep.py)
  var CROPS = { w: { x: 0, y: 396, w: 2048, h: 1366 }, p: { x: 448, y: 0, w: 1152, h: 2048 } }, SQ = 2048, SHORE_Y = 0.5805;
  var sec, stage, inner, photo, box, btn, note, lights = [], geo = { l: 0, t: 0, s: 1 }, mine = false, lit = false, calm = false;

  function measure() {
    var W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return;
    var c = CROPS[Img.orient()], s = Math.max(W / c.w, H / c.h), w = c.w * s, h = c.h * s;
    var l = Math.min(0, Math.max(W - w, W / 2 - (0.5 * SQ - c.x) * s));
    var t = Math.min(0, Math.max(H - h, H * 0.6 - (SHORE_Y * SQ - c.y) * s));       // Uferlinie auf 60 % der Höhe, soweit das Bild reicht
    geo.l = l - c.x * s; geo.t = t - c.y * s; geo.s = s;
    photo.style.width = w.toFixed(1) + 'px'; photo.style.height = h.toFixed(1) + 'px';
    photo.style.transform = 'translate3d(' + l.toFixed(1) + 'px,' + t.toFixed(1) + 'px,0)';
    inner.style.transformOrigin = '50% ' + ((geo.t + SHORE_Y * SQ * s) / H * 100).toFixed(1) + '%';
    place();
  }
  function place() {
    var unit = Math.max(2.7, Math.min(4.6, stage.clientWidth / 330));       // auf großen Schirmen etwas kräftiger: hier sind die Lichter das Motiv
    lights.forEach(function (el) {
      var sp = el._sp;
      el.style.left = (geo.l + sp.x * SQ * geo.s).toFixed(1) + 'px';
      el.style.top = (geo.t + sp.y * SQ * geo.s).toFixed(1) + 'px';
      el.style.setProperty('--s', (unit * sp.s * (el._mine ? 1.25 : 1)).toFixed(2) + 'px');
    });
  }
  function count() { return Math.max(0, Math.min(Sky.SPOTS.length - 2, Number(Live.S.summary.knoten || 0))); }
  function paint() {
    var n = count(), total = n + (mine ? 1 : 0), v = Live.values();
    while (lights.length > total) box.removeChild(lights.pop());
    while (lights.length < total) {
      var sp = Sky.SPOTS[lights.length], el = document.createElement('i');
      el.className = 'light'; el._sp = sp;
      el.style.setProperty('--d', sp.d.toFixed(2) + 's'); el.style.setProperty('--o', sp.o.toFixed(2));
      box.appendChild(el); lights.push(el);
      if (lit) el.classList.add('on');
    }
    lights.forEach(function (el, i) {
      var m = mine && i === total - 1;
      if (m === !!el._mine) return;
      el._mine = m; el.classList.toggle('is-mine', m);
      if (m) { el.classList.add('on'); var tag = document.createElement('b'); tag.className = 'light__tag'; el.appendChild(tag); }
      else { var old = el.querySelector('.light__tag'); if (old) el.removeChild(old); }
    });
    var tagEl = box.querySelector('.light__tag'); if (tagEl) tagEl.textContent = v.nodesNext;
    place();
    note.textContent = mine ? t('shore.note.on', { k: v.nodesNext }) : '';
    btn.textContent = t(mine ? 'shore.off' : 'shore.on');
    btn.setAttribute('aria-pressed', mine ? 'true' : 'false');
  }
  /** Die Lichter gehen an, sobald das Ufer ins Bild kommt: einzeln, in zufälliger Folge. */
  function lightUp() {
    if (lit) return; lit = true;
    lights.forEach(function (el) {
      if (calm) { el.classList.add('on'); return; }
      setTimeout(function () { el.classList.add('on'); }, 250 + Math.random() * 2300);
    });
  }
  function toggle() {
    mine = !mine; paint();
    if (!mine) return;
    // Ufer und Knopf sollen zugleich zu sehen sein
    var r = sec.getBoundingClientRect(), y = r.top + geo.t + SHORE_Y * SQ * geo.s;
    if (y < 70 || y > window.innerHeight - 90) window.scrollTo({ top: window.scrollY + r.top, behavior: calm ? 'auto' : 'smooth' });
  }

  /** Laternen: erst wenn beide Fotos geladen sind, blendet das helle ein. */
  function lanterns(page) {
    U.$$('[data-lanterns]').forEach(function (el) {
      if (el.getAttribute('data-lanterns') !== page) return;
      el.classList.remove('is-lit');
      var on = U.$('.lanterns__on', el);
      var go = function () { requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-lit'); }); }); };
      if (on && on.complete && on.naturalWidth) go(); else if (on) on.addEventListener('load', go, { once: true });
    });
  }
  function init() {
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    U.on('route', function (r) { lanterns(r.page); });
    lanterns(Router.current());
    sec = document.getElementById('shoreline'); if (!sec) return;
    stage = document.getElementById('shore'); inner = U.$('.shore__inner', stage); photo = U.$('.shore__photo', stage); box = U.$('.shore__lights', stage);
    btn = document.getElementById('shore-go'); note = document.getElementById('shore-note');
    measure(); paint();
    if (window.ResizeObserver) new ResizeObserver(measure).observe(stage); else window.addEventListener('resize', measure);
    U.on('orient', measure);
    U.on('route', function (r) { if (r.page === 'node') setTimeout(function () { measure(); paint(); }, 40); });
    U.on('data', paint); U.on('lang', paint);
    btn.addEventListener('click', toggle);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (l) { if (l[0].isIntersecting) { lightUp(); io.disconnect(); } }, { threshold: 0.35 });
      io.observe(stage);
    } else lightUp();
    // die Szene rückt beim Hineinscrollen ein wenig zurück (Lichter und Foto gemeinsam)
    if (!calm && window.gsap && window.ScrollTrigger) {
      gsap.fromTo(inner, { scale: 1.12 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top top', scrub: 0.5 } });
    }
  }
  return { init: init };
})();

/* ---- 54-log.js ---- */
/*
 * Knoten-Seite: das Logbuch der Kette. Jede Zeile ist ein Tag seit Block 0 (UTC), jeder Strich ein Block an seiner Uhrzeit;
 * warme Striche trugen Überweisungen. Die Daten sind dieselben wie im Band der Startseite (siehe 43-walk.js).
 * Beim Erscheinen läuft die Prüfung einmal von Block 0 bis zur Spitze durch, danach kommt jeder neue Block live dazu.
 */
var Log = (function () {
  'use strict';
  var root, canvas, ctx, tip, elN, elD, elCap;
  var W = 0, H = 0, dpr = 1, L = 46, TOP = 20, inner = 1, rowSpan = 86400, perRow = 1, rows = 1, pitch = 5, byRow = [];
  var k = 0, raf = 0, calm = false, ran = false, hover = -1, picked = -1, a0 = 0, aFrom = 0, aTo = 0, aDur = 0, head = null, fontOk = false;

  function C() { return Chain.get(); }
  function X(c, i) { return L + ((c.T[i] % rowSpan + rowSpan) % rowSpan) / rowSpan * inner; }
  function Y(c, i) { return TOP + Math.max(0, Math.floor(c.T[i] / rowSpan)) * pitch; }
  function glow() {
    var g = document.createElement('canvas'); g.width = g.height = 48;
    var x = g.getContext('2d'), grd = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    grd.addColorStop(0, 'rgba(255,255,255,.95)'); grd.addColorStop(0.22, 'rgba(190,225,255,.5)'); grd.addColorStop(1, 'rgba(120,180,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 48, 48);
    return g;
  }

  function layout() {
    var c = C(); if (!root || root.offsetParent === null || !c.n) return;
    W = Math.max(1, Math.round(canvas.parentNode.clientWidth));
    L = W < 520 ? 40 : 50; inner = W - L - 2;
    var span = c.T[c.n - 1] + 1, days = Math.ceil(span / 86400), maxH = W < 520 ? 330 : 396, minP = 3;
    perRow = Math.max(1, Math.ceil(days / Math.floor(maxH / minP)));
    rowSpan = 86400 * perRow; rows = Math.ceil(span / rowSpan);
    pitch = Math.max(minP, Math.min(7, Math.floor(maxH / rows * 2) / 2));
    H = Math.round(TOP + rows * pitch + 2);
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    index();
    caption();
    draw();
  }
  function index() {
    var c = C(), i, r;
    byRow = [];
    for (r = 0; r < rows; r++) byRow.push([]);
    for (i = 0; i < c.n; i++) { r = Math.min(rows - 1, Math.max(0, Math.floor(c.T[i] / rowSpan))); byRow[r].push(i); }
  }
  function caption() {
    if (elCap) elCap.textContent = perRow === 1 ? t('log.cap') : tn('log.cap.n', perRow, { d: U.num(perRow) });
  }

  function marks(c, from, to, w, hgt, warm) {
    var i, x, y, f;
    ctx.beginPath();
    for (i = from; i < to; i++) {
      f = c.F[i] & 4;
      if (warm !== null && !!f !== warm) continue;
      x = Math.round((X(c, i) - w / 2) * dpr) / dpr; y = Y(c, i);
      ctx.rect(x, y, w, hgt);
    }
    ctx.fill();
  }
  function draw() {
    if (!ctx || !W) return;
    var c = C(), n = c.n, lit = Math.max(0, Math.min(n, Math.floor(k))), w = W < 520 ? 1.2 : 1.6, hgt = Math.max(1.5, pitch - 1.5), i, r;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // Achsen: Uhrzeit oben, Datum links (erste Zeile und jeder Monatsanfang)
    ctx.font = '500 10px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textBaseline = 'alphabetic';
    [0, 6, 12, 18, 24].forEach(function (hh) {
      ctx.textAlign = hh === 0 ? 'left' : hh === 24 ? 'right' : 'center';
      ctx.fillText(hh + (hh === 24 ? ' h UTC' : ''), L + inner * hh / 24, 11);
    });
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (r = 0; r < rows; r++) {
      var d = new Date((c.t0 + r * rowSpan) * 1000);
      if (r === 0 || (perRow === 1 && d.getUTCDate() === 1)) ctx.fillText(shortDate(d), 0, TOP + r * pitch + hgt / 2 + 0.5);
    }
    // noch nicht geprüft: gedämpft
    ctx.fillStyle = 'rgba(170,198,255,.15)';
    marks(c, lit, n, w, hgt, null);
    // geprüft: kalt, von hellem Eisblau (Anfang) zu kräftigem Blau (heute)
    var g = ctx.createLinearGradient(0, TOP, 0, H);
    g.addColorStop(0, '#8FE3FF'); g.addColorStop(0.55, '#5AA2FF'); g.addColorStop(1, '#4A7DF5');
    ctx.fillStyle = g;
    marks(c, 0, lit, w, hgt, false);
    // mit Überweisungen: warm und etwas breiter
    ctx.fillStyle = '#FFC47A';
    marks(c, 0, lit, w * 1.7, hgt, true);
    // die Stelle, an der gerade geprüft wird
    if (raf && lit > 0 && lit < n) {
      ctx.globalCompositeOperation = 'lighter';
      for (i = Math.max(0, lit - 22); i < lit; i++) {
        var a = 1 - (lit - i) / 22, s = 7 + a * 9;
        ctx.globalAlpha = a * a;
        ctx.drawImage(head, X(c, i) - s, Y(c, i) + hgt / 2 - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // gewählter Block
    var sel = picked >= 0 ? picked : hover;
    if (sel >= 0 && sel < lit) {
      ctx.strokeStyle = (c.F[sel] & 4) ? '#FFE2B8' : '#EEF4FF'; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(X(c, sel) - w / 2 - 3) + 0.5, Y(c, sel) - 2.5, Math.round(w + 6), Math.round(hgt + 5));
    }
  }
  function shortDate(d) {
    try { return d.toLocaleDateString(U.loc(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\.$/, ''); }
    catch (e) { return d.getUTCDate() + '.' + (d.getUTCMonth() + 1) + '.'; }
  }
  function readout() {
    var c = C(), i = Math.max(0, Math.min(c.n - 1, Math.round(k) - 1));
    elN.textContent = U.num(i);
    elD.textContent = U.date(c.t0 + c.T[i]);
  }

  /* ---------- Ablauf ---------- */
  function animate(from, to, dur) {
    aFrom = from; aTo = to; aDur = dur; a0 = performance.now();
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    var q = Math.min(1, (now - a0) / aDur), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
    k = aFrom + (aTo - aFrom) * e;
    if (q >= 1) { k = aTo; raf = 0; readout(); draw(); return; }
    readout(); draw();
    raf = requestAnimationFrame(tick);
  }
  function run() {
    if (ran) return; ran = true;
    var n = C().n;
    if (calm) { k = n; readout(); draw(); return; }
    animate(0, n, 3000);
  }
  function grown() {
    var c = C();
    if (!W) return;
    var span = c.T[c.n - 1] + 1;
    if (Math.ceil(span / rowSpan) !== rows) layout(); else index();
    if (!ran) { draw(); return; }
    if (calm) { k = c.n; readout(); draw(); return; }
    if (!raf && Math.floor(k) < c.n) animate(Math.floor(k), c.n, 1100);
  }

  /* ---------- Zeigen und Antippen ---------- */
  function at(px, py) {
    var c = C(), r = Math.floor((py - TOP) / pitch), best = -1, bd = 12 * 12, rr, list, j, i, dx, dy, d, hgt = Math.max(1.5, pitch - 1.5);
    for (rr = Math.max(0, r - 1); rr <= Math.min(rows - 1, r + 1); rr++) {
      list = byRow[rr]; if (!list) continue;
      for (j = 0; j < list.length; j++) {
        i = list[j]; if (i >= Math.floor(k)) continue;
        dx = X(c, i) - px; dy = (Y(c, i) + hgt / 2 - py) * 1.6; d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }
  function showTip(i) {
    var c = C(), f = c.F[i];
    picked = i;
    U.$('[data-f="h"]', tip).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tip).textContent = (f & 8) ? t('walk.tip.approx') : U.date(c.t0 + c.T[i], true);
    U.$('[data-f="who"]', tip).textContent = (f & 8) ? '' : ((f & 3) === 0 ? t('walk.tip.solo') : t('walk.tip.pool')) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    U.$('a', tip).setAttribute('href', Router.href('#explorer-block-' + i));
    tip.hidden = false;
    var bw = tip.offsetWidth, bh = tip.offsetHeight, x = Math.max(0, Math.min(W - bw, X(c, i) - bw / 2)), y = Y(c, i) - bh - 12;
    if (y < -bh * 0.6) y = Y(c, i) + pitch + 12;
    tip.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px,0)';
    draw();
  }
  function hideTip() { if (tip) tip.hidden = true; picked = -1; draw(); }
  function pointer() {
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), i = at(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) hideTip(); else showTip(i);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), i = at(e.clientX - r.left, e.clientY - r.top);
      if (i !== hover) { hover = i; canvas.style.cursor = i < 0 ? '' : 'pointer'; if (!raf) draw(); }
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; if (!raf) draw(); } });
    document.addEventListener('click', function (e) { if (picked >= 0 && !root.contains(e.target)) hideTip(); });
  }

  function init() {
    root = document.getElementById('logbook'); if (!root) return;
    canvas = document.getElementById('log'); ctx = canvas.getContext('2d'); tip = document.getElementById('log-tip');
    elN = document.getElementById('log-n'); elD = document.getElementById('log-d'); elCap = document.getElementById('log-cap');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    head = glow();
    Chain.want();
    layout(); readout();
    if (window.ResizeObserver) new ResizeObserver(function () { if (canvas.parentNode.clientWidth !== W) layout(); }).observe(canvas.parentNode);
    else window.addEventListener('resize', layout);
    U.on('route', function (r) { if (r.page === 'node') setTimeout(function () { layout(); if (ran) { k = C().n; readout(); draw(); } }, 40); else hideTip(); });
    U.on('lang', function () { caption(); readout(); draw(); if (picked >= 0) showTip(picked); });
    U.on('data', grown);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; draw(); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (l) { if (l[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.3 });
      io.observe(canvas);
    } else run();
    pointer();
  }
  return { init: init };
})();

/* ---- 55-road.js ---- */
/*
 * Community: der Weg von der Abstimmung (25. Oktober 2026) bis Block 10.000, an dem Fassung 6 beginnt.
 * Der Stand kommt aus der Kette; die Schätzung rechnet mit der zuletzt gemessenen Blockzeit.
 */
var Road = (function () {
  'use strict';
  var root, bar, nowLab, line, need, VOTE = Date.UTC(2026, 9, 25, 12) / 1000;

  function heightAt(ts) {
    var c = Chain.get(), lo = 0, hi = c.n - 1, mid, rel = ts - c.t0;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (c.T[mid] <= rel) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function paint() {
    var h = Number(Live.S.summary.height), h0 = heightAt(VOTE), v = Live.values(), done = h >= U.V6;
    var q = Math.max(0, Math.min(1, (h - h0) / (U.V6 - h0)));
    root.style.setProperty('--q', q.toFixed(4));
    root.classList.toggle('is-done', done);
    nowLab.textContent = t('road.now', { h: v.height });
    line.textContent = done ? t('road.done') : t('road.left', { n: v.v6Left, eta: v.v6Eta });
    need.textContent = t(done ? 'road.need.done' : 'road.need');
    fit(q);
  }
  /** Die Beschriftung des jetzigen Blocks bleibt innerhalb der Linie. */
  function fit(q) {
    var W = bar.clientWidth, lw = nowLab.offsetWidth, x = q * W, shift = 0;
    if (!W || !lw) return;
    if (x + lw / 2 > W + 6) shift = W + 6 - (x + lw / 2);
    if (x - lw / 2 < -6) shift = -6 - (x - lw / 2);
    nowLab.style.setProperty('--shift', shift.toFixed(1) + 'px');
  }
  function init() {
    root = document.getElementById('road'); if (!root) return;
    bar = U.$('.road__bar', root); nowLab = document.getElementById('road-now'); line = document.getElementById('road-line'); need = U.$('[data-t="road.need"]', root);
    paint();
    U.on('data', paint); U.on('lang', paint);
    U.on('route', function (r) { if (r.page === 'community') setTimeout(paint, 40); });
    if (window.ResizeObserver) new ResizeObserver(paint).observe(bar);
  }
  return { init: init };
})();

/* ---- 56-pulse.js ---- */
/*
 * Explorer: die Kette als Zeitachse. Jedes Licht ist ein Block, der Abstand zweier Lichter ist die Zeit zwischen ihnen,
 * warme Lichter trugen Überweisungen. Zwei Ansichten:
 *   tip    – die letzten Stunden bis jetzt; rechts wartet der nächste Block, die Uhr zählt die Zeit seit dem letzten.
 *   around – die Stunden rund um einen bestimmten Block (in der Blockansicht), dieser Block ist hervorgehoben.
 * Die Zeiten stammen aus denselben Daten wie das Band der Startseite (43-walk.js).
 */
var Pulse = (function () {
  'use strict';
  function C() { return Chain.get(); }
  function sprite(r, g, b) {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.14, 'rgba(' + r + ',' + g + ',' + b + ',.9)');
    grd.addColorStop(0.45, 'rgba(' + r + ',' + g + ',' + b + ',.2)');
    grd.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }
  function make() {
    Chain.want();
  var root, hEl, nowEl, stage, canvas, ctx, tip, next;
  var mode = 'tip', center = 0, W = 0, H = 112, dpr = 1, span = 21600, padR = 0, t0win = 0, t1win = 0;
  var pts = [], hover = -1, picked = -1, timer = 0, raf = 0, sprites = null, lastTip = -1, wasLive = false, born = {}, fontOk = false, calm = false;

  function build() {
    hEl = U.el('h2', { 'class': 'pulse__h' });
    nowEl = U.el('p', { 'class': 'pulse__now', role: 'status' });
    canvas = U.el('canvas', { role: 'img' });
    next = U.el('i', { 'class': 'pulse__next', 'aria-hidden': 'true' });
    tip = U.el('div', { 'class': 'walk-tip', hidden: '' }, [
      U.el('p', { 'class': 'walk-tip__h mono', 'data-f': 'h' }), U.el('p', { 'data-f': 't' }), U.el('p', { 'class': 'faint', 'data-f': 'who' }),
      U.el('a', { href: Router.href('#explorer') })]);
    stage = U.el('div', { 'class': 'pulse__stage' }, [canvas, next, tip]);
    root = U.el('div', { 'class': 'pulse' }, [U.el('div', { 'class': 'pulse__head' }, [hEl, nowEl]), stage]);
    ctx = canvas.getContext('2d');
    sprites = { cool: sprite(120, 190, 255), warm: sprite(255, 186, 110), here: sprite(255, 214, 160) };
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (window.ResizeObserver) new ResizeObserver(size).observe(stage); else window.addEventListener('resize', size);
    pointer();
    U.on('data', refresh);
    U.on('lang', refresh);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; draw(); });
    timer = setInterval(tick, 1000);
  }

  /* ---------- Maße und Fenster ---------- */
  function size() {
    var w = Math.round(stage.clientWidth);
    if (!w) return;
    W = w; H = W < 560 ? 104 : 128;
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.style.height = H + 'px';
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    refresh();
  }
  function hours() { return W >= 900 ? 6 : W >= 560 ? 4 : 3; }
  function X(ts) { return (ts - t0win) / (t1win - t0win) * (W - padR); }
  function windowNow() {
    var c = C();
    span = hours() * 3600;
    if (mode === 'tip') { t1win = Live.now(); t0win = t1win - span; padR = 26; }
    else { var tc = c.t0 + c.T[Math.min(c.n - 1, center)]; t0win = tc - span / 2; t1win = tc + span / 2; padR = 0; }
  }
  function collect() {
    var c = C(), i, ts, list = [], y0 = H * 0.44, lvl = 0, prev = -99;
    for (i = c.n - 1; i >= 0; i--) {
      ts = c.t0 + c.T[i];
      if (ts > t1win) continue;
      if (ts < t0win - 5400) break;                 // Zeitstempel dürfen leicht springen, deshalb etwas Luft
      if (ts >= t0win) list.push({ i: i, x: X(ts), y: y0, f: c.F[i] });
    }
    list.sort(function (a, b) { return a.x - b.x; });
    list.forEach(function (p) {                     // sehr dicht beieinander: abwechselnd leicht versetzen
      if (p.x - prev < 8) { lvl = (lvl + 1) % 3; p.y = y0 + [0, -8, 8][lvl]; } else lvl = 0;
      prev = p.x;
    });
    pts = list;
  }

  /* ---------- Zeichnen ---------- */
  function draw() {
    if (!ctx || !W) return;
    var y0 = Math.round(H * 0.44) + 0.5, hrs = hours(), k, x, i, p, s, now = performance.now(), busy = false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // die Linie der Zeit: nach links hin verblassend
    var g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(170,198,255,0)'); g.addColorStop(0.1, 'rgba(170,198,255,.2)'); g.addColorStop(1, 'rgba(170,198,255,.26)');
    ctx.strokeStyle = g; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W - (mode === 'tip' ? padR - 8 : 0), y0); ctx.stroke();
    // Stundenmarken
    ctx.font = '500 10px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
    ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.strokeStyle = 'rgba(170,198,255,.3)'; ctx.textBaseline = 'alphabetic';
    var half = Math.floor(hrs / 2), mid = (t0win + t1win) / 2;
    for (k = mode === 'tip' ? 0 : -half; k <= (mode === 'tip' ? hrs : half); k++) {
      var rel = mode === 'tip' ? -k : k, ts = mode === 'tip' ? t1win - k * 3600 : mid + k * 3600, label;
      x = Math.round(X(ts)) + 0.5;
      if (mode === 'around' && rel === 0) continue;
      ctx.beginPath(); ctx.moveTo(x, y0 + 14); ctx.lineTo(x, y0 + 20); ctx.stroke();
      label = rel === 0 ? (Live.S.mode === 'live' ? t('pulse.now') : new Date(t1win * 1000).toISOString().slice(11, 16) + ' UTC') : (rel > 0 ? '+' : '−') + Math.abs(rel) + ' h';
      ctx.textAlign = x < 24 ? 'left' : x > W - 30 ? 'right' : 'center';
      ctx.fillText(label, x < 24 ? 0 : x > W - 30 ? W : x, H - 6);
    }
    // die Lichter
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      var here = mode === 'around' && p.i === center, sel = p.i === hover || p.i === picked;
      s = here ? 52 : sel ? 42 : 32;
      ctx.drawImage(here ? sprites.here : (p.f & 4) ? sprites.warm : sprites.cool, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (i = 0; i < pts.length; i++) {
      p = pts[i];
      ctx.fillStyle = (mode === 'around' && p.i === center) ? '#FFE9C8' : (p.f & 4) ? '#FFD9A6' : '#DDEBFF';
      ctx.beginPath(); ctx.arc(p.x, p.y, mode === 'around' && p.i === center ? 3.4 : 2.4, 0, 6.2832); ctx.fill();
      // ein eben gefundener Block: ein Ring läuft nach außen
      if (born[p.i]) {
        var q = (now - born[p.i]) / 1600;
        if (q >= 1 || calm) delete born[p.i];
        else { busy = true; ctx.strokeStyle = 'rgba(255,214,160,' + (1 - q).toFixed(3) + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 4 + q * 22, 0, 6.2832); ctx.stroke(); }
      }
      if (p.i === hover || p.i === picked) { ctx.strokeStyle = 'rgba(238,244,255,.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, 6.2832); ctx.stroke(); }
    }
    // der gewählte Block der Blockansicht: Ring und Beschriftung
    if (mode === 'around') {
      for (i = 0; i < pts.length; i++) if (pts[i].i === center) {
        p = pts[i];
        ctx.strokeStyle = 'rgba(255,196,122,.9)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = '#FFC47A'; ctx.font = '500 11px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace';
        var lab = t('walk.tip.block', { h: U.num(center) }), lw = ctx.measureText(lab).width;
        ctx.textAlign = 'left'; ctx.fillText(lab, Math.max(0, Math.min(W - lw, p.x - lw / 2)), p.y - 22);
      }
    }
    if (busy && !raf) raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }
  function text() {
    var c = C(), hrs = hours(), v = Live.values();
    if (mode === 'tip') {
      hEl.textContent = t('pulse.tip.h', { n: U.num(hrs) });
      if (Live.S.mode === 'live') {
        var d = Math.max(0, Live.now() - Number(Live.S.blocks[0].timestamp)), m = Math.floor(d / 60), s = d % 60;
        nowEl.textContent = t('pulse.next', { h: v.nextHeight, t: (m ? U.num(m) + ' min ' : '') + s + ' s' });
      } else nowEl.textContent = v.mode;
    } else {
      hEl.textContent = t('pulse.around.h', { h: U.num(center) });
      nowEl.textContent = tn('pulse.around.n', pts.length, { n: U.num(pts.length), k: U.num(hrs) });
    }
    next.hidden = !(mode === 'tip' && Live.S.mode === 'live');
    next.style.top = (Math.round(H * 0.44) - 6) + 'px';
    canvas.setAttribute('aria-label', t('pulse.alt'));
    if (c.n && picked >= c.n) hide();
  }
  function refresh() {
    if (!root || !W || !root.isConnected) return;
    var c = C(), tipH = c.n - 1;
    if (lastTip >= 0 && tipH > lastTip && tipH - lastTip < 4 && mode === 'tip' && wasLive) for (var h = lastTip + 1; h <= tipH; h++) born[h] = performance.now();
    lastTip = tipH; wasLive = Live.S.mode === 'live';
    windowNow(); collect(); text(); draw();
    if (picked >= 0) place(picked);
  }
  var beat = 0;
  function tick() {
    if (!root || !root.isConnected || document.hidden || mode !== 'tip' || Live.S.mode !== 'live') return;
    text();
    if (++beat % 10 === 0) { windowNow(); collect(); draw(); }      // die Lichter wandern langsam nach links
  }

  /* ---------- Zeigen und Antippen ---------- */
  function nearest(px, py, max) {
    var best = -1, bd = max * max, i, dx, dy, d;
    for (i = 0; i < pts.length; i++) { dx = pts[i].x - px; dy = pts[i].y - py; d = dx * dx + dy * dy; if (d < bd) { bd = d; best = pts[i].i; } }
    return best;
  }
  function who(f) {
    var cls = f & 3;
    return cls === 0 ? t('walk.tip.solo') : cls === 1 ? t('pulse.by', { who: 'YSKAR MAIN' }) : cls === 2 ? t('pulse.by', { who: 'Gozero' }) : t('walk.tip.pool');
  }
  function place(i) {
    var c = C(), p = null, k;
    for (k = 0; k < pts.length; k++) if (pts[k].i === i) p = pts[k];
    if (!p) { hide(); return; }
    var f = c.F[i];
    U.$('[data-f="h"]', tip).textContent = t('walk.tip.block', { h: U.num(i) });
    U.$('[data-f="t"]', tip).textContent = (f & 8) ? t('walk.tip.approx') : U.date(c.t0 + c.T[i], true);
    U.$('[data-f="who"]', tip).textContent = (f & 8) ? '' : who(f) + ((f & 4) ? ' · ' + t('walk.tip.tx') : '');
    var a = U.$('a', tip); a.setAttribute('href', Router.href('#explorer-block-' + i)); a.textContent = t('walk.open');
    a.hidden = mode === 'around' && i === center;
    tip.hidden = false;
    var bw = tip.offsetWidth, bh = tip.offsetHeight, x = Math.max(0, Math.min(W - bw, p.x - bw / 2));
    tip.style.transform = 'translate3d(' + x.toFixed(0) + 'px,' + (p.y - bh - 16).toFixed(0) + 'px,0)';
  }
  function hide() { if (tip) tip.hidden = true; picked = -1; }
  function pointer() {
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(), i = nearest(e.clientX - r.left, e.clientY - r.top, 16);
      if (i === hover) return;
      hover = i; canvas.style.cursor = i < 0 ? '' : 'pointer';
      if (i >= 0) place(i); else if (picked < 0) tip.hidden = true;
      draw();
    });
    canvas.addEventListener('pointerleave', function () { if (hover !== -1) { hover = -1; if (picked < 0) tip.hidden = true; draw(); } });
    canvas.addEventListener('click', function (e) {
      var r = canvas.getBoundingClientRect(), i = nearest(e.clientX - r.left, e.clientY - r.top, 24);
      if (i < 0) { hide(); draw(); return; }
      if (hover === i && !(mode === 'around' && i === center)) { Router.go('#explorer-block-' + i); return; }   // mit der Maus: direkt öffnen
      picked = i; place(i); draw();
    });
    document.addEventListener('click', function (e) { if (picked >= 0 && !root.contains(e.target)) { hide(); draw(); } });
  }

  /** Ansicht setzen: { mode: 'tip' } oder { mode: 'around', h: Blockhöhe }. Gibt das Element zurück, das die Seite einhängt. */
  function set(o) {
    if (!root) build();
    var changed = o.mode !== mode || (o.mode === 'around' && o.h !== center);
    mode = o.mode; center = o.h || 0;
    if (changed) { hover = -1; hide(); born = {}; }
    // nach dem Einhängen neu messen (das Element ist jetzt vielleicht zum ersten Mal sichtbar)
    requestAnimationFrame(function () { if (root.isConnected) { if (Math.round(stage.clientWidth) !== W) size(); else refresh(); } });
    return root;
  }
    return { set: set };
  }
  var one = null;
  function has(h) { return h >= 0 && h < C().n; }
  /** set(): das Exemplar des Explorers; make(): ein weiteres, eigenes Exemplar (Netz-Seite). */
  return { set: function (o) { if (!one) one = make(); return one.set(o); }, has: has, make: make };
})();

/* ---- 57-coin-gl.js ---- */
/*
 * Die Münze aus Glas, in Echtzeit gerechnet (WebGL): eine dicke Scheibe mit erhabenem Rand, vorn das Zeichen als Relief,
 * hinten die Inschrift aus Block 0. Jeder Bildpunkt schneidet seinen Sehstrahl mit dem Zylinder; das Relief kommt aus einer
 * Höhenkarte, die einmal aus dem Pfad des Zeichens bzw. aus dem Text gerechnet wird. Licht: ein kühles Hauptlicht von oben
 * links, ein warmes Lampenlicht von unten rechts. Ohne WebGL bleibt die gezeichnete Münze stehen (siehe 57-coin.js).
 */
var CoinGL = (function () {
  'use strict';

  function f(v) { var s = v.toFixed(5); return s.indexOf('.') < 0 ? s + '.0' : s; }
  function unit(x, y, z) { var l = Math.sqrt(x * x + y * y + z * z); return 'vec3(' + f(x / l) + ',' + f(y / l) + ',' + f(z / l) + ')'; }

  var L1 = unit(-0.50, 0.72, 0.62), L2 = unit(0.72, -0.50, 0.40), BOX = unit(-0.45, 0.62, 0.64), LAMP = unit(0.70, -0.46, 0.55);
  var VERT = 'attribute vec2 a;varying vec2 vQ;void main(){vQ=a;gl_Position=vec4(a,0.0,1.0);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 vQ;',
    'uniform mat3 uRot;',            // Münze -> Blick
    'uniform sampler2D uFront;', 'uniform sampler2D uBack;',
    'uniform float uPx;',            // Breite eines Bildpunkts in vQ-Einheiten
    'uniform vec2 uBump;',           // Steigung je Einheit der Karte: vorn, hinten
    'uniform vec2 uH;',              // Höhe des Reliefs in Radien: vorn, hinten
    'const float H = 0.092;',        // halbe Dicke bis zur Oberkante des Rands, Radius = 1
    'const float D = 5.4;',          // Abstand der Kamera
    'const float EXT = 1.19;',       // halbe Bildbreite in der Ebene der Münze
    'const float R1 = 0.760;', 'const float R2 = 0.880;',     // Innenflanke des Rands: breit und weich
    'const float RIMH = 0.050;',     // so tief liegt der Grund unter dem Rand
    'const vec3 L1 = ' + L1 + ';', 'const vec3 L2 = ' + L2 + ';',

    // gedachter Raum, der sich im Glas spiegelt: weiche Lichtfläche oben links, kühler Himmel, warmer Schein unten rechts
    'vec3 env(vec3 r) {',
    '  float sky = smoothstep(-0.25, 0.9, r.y);',
    '  float box = smoothstep(0.78, 0.97, dot(r, ' + BOX + '));',
    '  float lamp = smoothstep(0.86, 0.985, dot(r, ' + LAMP + '));',
    '  return vec3(0.30, 0.52, 0.98) * sky * 0.30 + vec3(0.92, 0.97, 1.0) * box * 0.70 + vec3(1.0, 0.76, 0.46) * lamp * 0.55;',
    '}',
    'vec4 tex(vec2 xy, float sgn) {',                        // Rückseite gespiegelt, damit die Schrift richtig steht
    '  vec2 uv = vec2(sgn * xy.x, -xy.y) * 0.5 + 0.5;',
    '  return sgn > 0.0 ? texture2D(uFront, uv) : texture2D(uBack, uv);',
    '}',
    'float depth(vec2 xy, float sgn, float hy) {',           // wie tief die Fläche hier unter der Oberkante des Rands liegt
    '  return max(RIMH * (1.0 - smoothstep(R1, R2, length(xy))) - tex(xy, sgn).b * hy, 0.0);',
    '}',

    'vec4 shade(vec2 q) {',
    '  vec3 rd = normalize(vec3(q * (EXT / D), -1.0));',
    '  vec3 o = vec3(0.0, 0.0, D) * uRot;',                 // Vektor mal Matrix = Rückdrehung in den Raum der Münze
    '  vec3 d = rd * uRot;',
    '  float tb = 1e9;',
    '  float kind = 0.0;',                                   // 1 Vorderseite, 2 Rückseite, 3 Rand
    '  if (abs(d.z) > 1e-5) {',
    '    float zc = d.z < 0.0 ? H : -H;',
    '    float t = (zc - o.z) / d.z;',
    '    vec2 pc = o.xy + d.xy * t;',
    '    if (t > 0.0 && dot(pc, pc) <= 1.0) { tb = t; kind = d.z < 0.0 ? 1.0 : 2.0; }',
    '  }',
    '  float a = dot(d.xy, d.xy);',
    '  if (a > 1e-6) {',
    '    float b = dot(o.xy, d.xy);',
    '    float c = dot(o.xy, o.xy) - 1.0;',
    '    float disc = b * b - a * c;',
    '    if (disc > 0.0) {',
    '      float t = (-b - sqrt(disc)) / a;',
    '      float z = o.z + d.z * t;',
    '      if (t > 0.0 && abs(z) <= H && t < tb) { tb = t; kind = 3.0; }',
    '    }',
    '  }',
    '  if (kind < 0.5) return vec4(0.0);',
    '  vec3 p = o + d * tb;',
    '  vec3 n;',
    '  float top = 0.0; float ao = 1.0; float rim = 0.0; float side = 0.0; float shadow = 0.0; float gloss = 0.0;',
    '  if (kind > 2.5) {',
    '    vec2 dir = normalize(p.xy);',
    '    float zr = p.z / H;',
    '    float ts = smoothstep(0.0, 1.0, abs(zr));',
    '    n = normalize(vec3(dir, sign(zr) * ts * 0.85));',  // zu den Flächen hin abgerundet
    '    side = 1.0;',
    '    gloss = ts;',
    '  } else {',
    '    float sgn = kind < 1.5 ? 1.0 : -1.0;',
    '    float hy = kind < 1.5 ? uH.x : uH.y;',
    // Relief: dem Sehstrahl von der Oberkante des Rands in die Tiefe folgen, bis er die Fläche trifft
    '    vec2 dxy = d.xy / max(abs(d.z), 0.24);',                       // streifend flacher rechnen: ruhiges Bild beim Wenden
    '    float s0 = 0.0;',
    '    float f0 = depth(p.xy, sgn, hy);',
    '    float s1 = 0.0;',
    '    float f1 = f0;',
    '    if (f0 > 0.0) {',
    '      for (int i = 1; i <= 8; i++) {',
    '        s1 = RIMH * float(i) / 8.0;',
    '        f1 = depth(p.xy + dxy * s1, sgn, hy) - s1;',
    '        if (f1 <= 0.0) break;',
    '        s0 = s1; f0 = f1;',
    '      }',
    '      s1 = mix(s0, s1, clamp(f0 / max(f0 - f1, 1e-5), 0.0, 1.0));',
    '    }',
    '    vec2 xy = p.xy + dxy * s1;',
    '    p.xy = xy;',
    '    float r = length(xy);',
    '    vec2 dir = xy / max(r, 1e-4);',
    '    float t1 = clamp((r - R1) / (R2 - R1), 0.0, 1.0);',
    '    float slope = 6.0 * t1 * (1.0 - t1) / (R2 - R1) * RIMH;',     // vom Grund hinauf auf den Rand
    '    float te = clamp((r - 0.885) / 0.115, 0.0, 1.0);',
    '    slope -= te * 1.25;',                                          // der Rand ist ein runder Wulst: gleich hinter dem Scheitel fällt er zur Kante ab
    '    vec2 g = dir * slope;',
    '    vec4 tx = tex(xy, sgn);',
    '    float bump = kind < 1.5 ? uBump.x : uBump.y;',
    '    vec2 tg = (tx.rg * 255.0 - 128.0) / 127.0 * bump;',
    '    g += vec2(sgn * tg.x, -tg.y);',
    '    n = normalize(vec3(-g, sgn));',
    '    gloss = clamp(length(g) * 1.3, 0.0, 1.0);',
    '    top = kind < 1.5 ? smoothstep(0.36, 0.64, tx.b) : smoothstep(0.44, 0.58, tx.b);',   // Schrift mit schärferer Kante
    '    rim = smoothstep(R1, R2, r);',
    '    ao = 1.0 - clamp((tx.a - tx.b) * 0.8, 0.0, 0.16);',            // etwas dunkler am Fuß des Reliefs
    '    ao *= 1.0 - 0.16 * smoothstep(R1 - 0.12, R1 + 0.01, r) * (1.0 - smoothstep(R1 + 0.01, R1 + 0.07, r));',
    '    vec3 lo = L1 * uRot;',                                         // Schlagschatten: vom Punkt aus zum Licht schauen
    '    float occ = tex(xy + lo.xy * hy * 1.1, sgn).b;',                // so weit, wie das Relief hoch ist
    '    shadow = smoothstep(0.25, 0.75, occ) * (1.0 - top);',
    '  }',
    '  vec3 nv = uRot * n;',
    '  vec3 v = -rd;',
    '  float wrap = clamp(dot(nv, L1) * 0.5 + 0.5, 0.0, 1.0);',         // Licht greift um den Körper: mattes Glas
    '  float ndv = max(dot(nv, v), 0.0);',
    '  float fres = pow(1.0 - ndv, 2.6);',
    '  float nh = max(dot(nv, normalize(L1 + v)), 0.0);',
    '  float sp1 = pow(nh, 120.0);',
    '  float sp2 = pow(nh, 18.0);',
    '  float sp3 = pow(nh, 44.0);',
    '  float nl2 = max(dot(nv, L2), 0.0);',
    '  float spw = pow(max(dot(nv, normalize(L2 + v)), 0.0), 36.0);',
    '  vec3 deep = vec3(0.11, 0.25, 0.86);',
    '  vec3 mid = vec3(0.23, 0.44, 0.98);',
    '  vec3 light = vec3(0.60, 0.81, 1.0);',
    '  vec3 col = mix(deep, mid, smoothstep(-0.05, 0.92, wrap));',     // die Fläche bleibt sattes Blau, auch wenn sie zum Licht zeigt
    '  col = mix(col, light, smoothstep(0.93, 1.0, wrap) * 0.30);',
    '  vec3 pv = uRot * p;',
    '  float ga = clamp(0.5 + 0.55 * dot(pv.xy, vec2(-0.57, 0.82)), 0.0, 1.0);',   // weiches Flächenlicht: zur Lichtseite hin heller
    '  col *= mix(0.78, 1.18, ga);',
    '  col = mix(col, col * vec3(1.14, 0.97, 1.03) + vec3(0.09, 0.03, 0.07), smoothstep(0.45, 1.0, ga) * 0.60);',   // Schimmer ins Flieder
    '  col *= ao * (1.0 - 0.20 * shadow);',
    '  vec3 raised = mix(vec3(0.70, 0.92, 1.0), vec3(0.50, 0.72, 1.0), clamp(0.5 - 0.9 * p.y + 0.3 * p.x, 0.0, 1.0));',   // das Zeichen: oben eisig, zum Fuß hin blauer
    '  col = mix(col, mix(col * 1.2, raised * (0.80 + 0.30 * ga), 0.72), top);',
    '  col = mix(col * vec3(0.80, 0.86, 0.98), col, max(top, rim));',   // der Grund liegt tiefer: satteres Blau
    '  col = mix(col, mix(col, vec3(0.72, 0.86, 1.0), 0.34), rim * (1.0 - side));',   // der Rand ist das hellste Glas
    '  float arc = dot(normalize(pv.xy + vec2(1e-4)), vec2(-0.57, 0.82));',           // am Rand entlang: zur Lichtseite Flieder, gegenüber Aqua
    '  col = mix(col, col * vec3(1.12, 0.94, 1.02) + vec3(0.06, 0.0, 0.05), max(rim, side) * smoothstep(0.1, 1.0, arc) * 0.50);',
    '  col = mix(col, col * vec3(0.92, 1.05, 1.0) + vec3(0.0, 0.04, 0.03), max(rim, side) * smoothstep(0.1, 1.0, -arc) * 0.45);',
    '  col = mix(col, mix(col, light, 0.55) * 1.08, side);',            // im Rand der Scheibe sammelt sich das Licht
    '  float far = clamp(0.5 + 0.5 * dot(pv.xy, vec2(0.57, -0.82)), 0.0, 1.0);',   // Licht wandert durchs Glas und tritt gegenüber am Rand aus
    '  col += vec3(0.30, 0.52, 0.85) * far * far * max(rim, side) * 0.30;',
    '  vec3 e = env(reflect(-v, nv));',
    '  col += e * (0.05 + 0.90 * fres);',                               // Spiegelungen streifend deutlich,
    '  col += e * gloss * 0.38;',                                       // und auf allen Rundungen
    '  col += fres * vec3(0.45, 0.70, 1.0) * 0.42;',
    '  col += sp2 * vec3(0.55, 0.76, 1.0) * 0.16;',
    '  col += sp1 * 0.55;',
    '  col += sp3 * gloss * 0.45;',
    '  float lampR = smoothstep(0.90, 0.995, dot(reflect(-v, nv), ' + LAMP + ')) * max(gloss, side);',
    '  col = mix(col, vec3(1.0, 0.82, 0.60), lampR * 0.60);',           // das warme Licht der Lampe spiegelt sich auf den Rundungen
    '  col += vec3(1.0, 0.74, 0.44) * spw * 0.5;',
    '  return vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}',
    'void main() {',                                                    // vier Strahlen je Bildpunkt: glatte Kanten
    '  vec4 c = shade(vQ + vec2(0.125, 0.375) * uPx) + shade(vQ + vec2(-0.375, 0.125) * uPx)',
    '         + shade(vQ + vec2(0.375, -0.125) * uPx) + shade(vQ + vec2(-0.125, -0.375) * uPx);',
    '  gl_FragColor = c * 0.25;',
    '}'
  ].join('\n');

  /** Weichzeichnen einer Fläche N×N mit wiederholtem Kastenfilter (nähert eine Glocke an); r in Bildpunkten. */
  function blur(src, N, r, passes) {
    r = Math.max(1, Math.round(r));
    var a = src, b = new Float32Array(N * N), w = 2 * r + 1, p, x, y, i, sum, row;
    for (p = 0; p < passes; p++) {
      for (y = 0; y < N; y++) {
        row = y * N; sum = 0;
        for (i = -r; i <= r; i++) sum += a[row + (i < 0 ? 0 : i > N - 1 ? N - 1 : i)];
        for (x = 0; x < N; x++) {
          b[row + x] = sum / w;
          sum += a[row + (x + r + 1 < N ? x + r + 1 : N - 1)] - a[row + (x - r > 0 ? x - r : 0)];
        }
      }
      if (a === src) a = new Float32Array(N * N);
      for (x = 0; x < N; x++) {
        sum = 0;
        for (i = -r; i <= r; i++) sum += b[(i < 0 ? 0 : i > N - 1 ? N - 1 : i) * N + x];
        for (y = 0; y < N; y++) {
          a[y * N + x] = sum / w;
          sum += b[(y + r + 1 < N ? y + r + 1 : N - 1) * N + x] - b[(y - r > 0 ? y - r : 0) * N + x];
        }
      }
    }
    return a;
  }

  /**
   * Höhenkarte aus einer Zeichnung (weiß auf schwarz): R, G = Steigung, B = Höhe, A = weit verwischte Höhe (für die Schatten am Fuß).
   * height: Höhe des Reliefs in Radien. Liefert die Karte und den Faktor, mit dem der Shader die Steigung zurückrechnet.
   */
  function relief(N, draw, rFine, rWide, height) {
    var c = document.createElement('canvas'); c.width = c.height = N;
    var x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N); x.fillStyle = '#fff';
    draw(x, N);
    var px = x.getImageData(0, 0, N, N).data, n = N * N, m = new Float32Array(n), i, X, Y, g;
    for (i = 0; i < n; i++) m[i] = px[i * 4] / 255;
    var fine = blur(m, N, rFine, 3), wide = blur(m, N, rWide, 2);
    var gx = new Float32Array(n), gy = new Float32Array(n), max = 1e-6;
    for (Y = 1; Y < N - 1; Y++) for (X = 1; X < N - 1; X++) {
      i = Y * N + X;
      gx[i] = (fine[i + 1] - fine[i - 1]) * 0.5; gy[i] = (fine[i + N] - fine[i - N]) * 0.5;
      g = Math.abs(gx[i]); if (g > max) max = g;
      g = Math.abs(gy[i]); if (g > max) max = g;
    }
    var K = 0.98 / max, out = new Uint8Array(n * 4);
    for (i = 0; i < n; i++) {
      out[i * 4] = Math.round(gx[i] * K * 127 + 128);
      out[i * 4 + 1] = Math.round(gy[i] * K * 127 + 128);
      out[i * 4 + 2] = Math.round(fine[i] * 255);
      out[i * 4 + 3] = Math.round(wide[i] * 255);
    }
    return { data: out, n: N, bump: height * N / (2 * K), h: height };
  }

  /** Verbindet die Fläche mit WebGL. Liefert null, wenn das Gerät es nicht kann. */
  function mount(canvas, onRestore) {
    var gl = null, prog, loc, texF, texB, relF = null, relB = null;
    var opts = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
    var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    var N = coarse ? 512 : 1024, q = 1;

    function upload(unitNo, tex, rel) {
      gl.activeTexture(gl.TEXTURE0 + unitNo); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rel.n, rel.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, rel.data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);     // ohne Stufen: die Karte wird in Schleifen gelesen
    }
    function make() {
      gl = null;
      try { gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts); } catch (e) { gl = null; }
      if (!gl) return false;
      try {
        var sh = function (type, src) {
          var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader');
          return s;
        };
        prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'Programm');
      } catch (e) {
        if (window.console) console.warn('[YSKAR] Münze: WebGL nicht nutzbar, die gezeichnete Fassung bleibt.', e);
        gl = null; return false;
      }
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      loc = { rot: gl.getUniformLocation(prog, 'uRot'), px: gl.getUniformLocation(prog, 'uPx'), bump: gl.getUniformLocation(prog, 'uBump'), h: gl.getUniformLocation(prog, 'uH') };
      gl.uniform1i(gl.getUniformLocation(prog, 'uFront'), 0); gl.uniform1i(gl.getUniformLocation(prog, 'uBack'), 1);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
      texF = gl.createTexture(); texB = gl.createTexture();
      var blank = { data: new Uint8Array([128, 128, 0, 0]), n: 1, bump: 0, h: 0 };
      upload(0, texF, relF || blank); upload(1, texB, relB || blank);
      return true;
    }
    if (!make()) return null;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); gl = null; });
    canvas.addEventListener('webglcontextrestored', function () { if (make() && onRestore) onRestore(); });

    return {
      /** Vorderseite: das Zeichen aus seinem SVG-Pfad (viewBox 187.5 184 879 879). */
      front: function (pathData) {
        relF = relief(N, function (x, n) {
          var s = n * 0.545 / 879;
          x.save(); x.translate(n * 0.5 - (187.5 + 439.5) * s, n * 0.512 - (184 + 439.5) * s); x.scale(s, s);
          x.fill(new Path2D(pathData)); x.restore();
        }, N * 0.0075, N * 0.024, 0.042);
        if (gl) upload(0, texF, relF);
      },
      /** Rückseite: drei Zeilen Schrift. */
      back: function (lines) {
        relB = relief(N, function (x, n) {
          var fam = '"Geist Mono",ui-monospace,Menlo,Consolas,monospace';
          x.textAlign = 'center'; x.textBaseline = 'alphabetic';
          x.font = '500 ' + (n * 0.050).toFixed(1) + 'px ' + fam; x.fillText(lines[0], n * 0.5, n * 0.400);
          x.font = '500 ' + (n * 0.071).toFixed(1) + 'px ' + fam; x.fillText(lines[1], n * 0.5, n * 0.527);
          x.font = '500 ' + (n * 0.050).toFixed(1) + 'px ' + fam; x.fillText(lines[2], n * 0.5, n * 0.638);
        }, N * 0.0016, N * 0.008, 0.013);
        if (gl) upload(1, texB, relB);
      },
      /** Größe der Zeichenfläche: css = Kantenlänge in CSS-Pixeln. */
      resize: function (css) {
        var dpr = Math.min(3, window.devicePixelRatio || 1), side = Math.max(96, Math.round(Math.min(css * dpr, coarse ? 660 : 1040) * q));
        if (canvas.width !== side) { canvas.width = side; canvas.height = side; }
      },
      /** Güte 1 = volle Auflösung. Dauert ein Bild zu lang, senkt der Aufrufer sie; die Fläche wird dann kleiner gerechnet und vergrößert gezeigt. */
      quality: function (v) { if (v !== undefined) q = Math.max(0.45, Math.min(1, v)); return q; },
      /** Zeichnet die Münze. Winkel in Grad: erst um die eigene Achse (rz), dann wenden (ry), dann neigen (rx). */
      draw: function (rx, ry, rz) {
        if (!gl) return;
        var k = Math.PI / 180, cx = Math.cos(rx * k), sx = Math.sin(rx * k), cy = Math.cos(ry * k), sy = Math.sin(ry * k), cz = Math.cos(rz * k), sz = Math.sin(rz * k);
        // R = Rx · Ry · Rz, spaltenweise übergeben
        gl.uniformMatrix3fv(loc.rot, false, [
          cy * cz, cx * sz + sx * sy * cz, sx * sz - cx * sy * cz,
          -cy * sz, cx * cz - sx * sy * sz, sx * cz + cx * sy * sz,
          sy, -sx * cy, cx * cy]);
        gl.uniform1f(loc.px, 2 / canvas.width);
        gl.uniform2f(loc.bump, relF ? relF.bump : 0, relB ? relB.bump : 0);
        gl.uniform2f(loc.h, relF ? relF.h : 0, relB ? relB.h : 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      alive: function () { return !!gl; }
    };
  }
  return { mount: mount };
})();

/* ---- 57-coin.js ---- */
/*
 * YSR-Seite: die Münze als Körper aus Glas. Vorn das Zeichen als Relief, hinten die Inschrift aus Block 0.
 * Sie liegt schräg im Raum, folgt dem Zeiger, neigt sich beim Scrollen und lässt sich mit dem Finger oder dem Knopf umdrehen.
 * Gerechnet wird sie in 57-coin-gl.js. Kann das Gerät kein WebGL, steht stattdessen die gezeichnete Münze (dunkle Scheibe
 * mit Ring), die sich genauso bedienen lässt. Mit „Bewegung reduzieren“ steht sie still; der Knopf wechselt die Seite ohne Drehung.
 */
var Coin = (function () {
  'use strict';
  var root, stage, body, btn, canvas, glc = null, tried = false, LAYERS = 22;
  var REST = { rx: -32, ry: -22, rz: 0, rzBack: 12 };   // Ruhelage der Glasmünze: Fläche nach links oben, Rand rechts unten sichtbar; hinten so gedreht, dass die Schrift waagrecht steht
  var ry = -34, rx = 9, base = 0, hx = 0, hy = 0, tilt = 0, drag = null, vel = 0, raf = 0, seen = false, visible = false, calm = false, t0 = 0, settled = false;
  var last = 0, skip = false, load = 0.016, frames = 0, backDone = false;

  function label() {
    var back = Math.round(base / 180) % 2 !== 0;
    btn.textContent = t(back ? 'coin.turn.back' : 'coin.turn');
    btn.setAttribute('aria-pressed', back ? 'true' : 'false');
  }
  function apply() {
    if (glc) {
      var turn = (1 - Math.cos(ry * Math.PI / 180)) / 2;                // 0 = Vorderseite, 1 = Rückseite
      glc.draw(REST.rx + rx, REST.ry + ry, REST.rz + (REST.rzBack - REST.rz) * turn);
      stage.style.setProperty('--sx', Math.max(0.3, Math.abs(Math.cos((REST.ry + ry) * Math.PI / 180))).toFixed(3));
      return;
    }
    body.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    body.style.setProperty('--rx', rx.toFixed(2) + 'deg');
    var a = ((ry % 360) + 540) % 360 - 180;                       // -180..180, 0 = Vorderseite
    body.style.setProperty('--sh', (a * 2.3).toFixed(1));
    stage.style.setProperty('--sx', Math.max(0.16, Math.abs(Math.cos(ry * Math.PI / 180))).toFixed(3));
  }
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden || Router.current() !== 'ysr') { last = 0; return; }
    var dt = last ? Math.min(0.1, (now - last) / 1000) : 0.016;
    var ph = (now - t0) / 2600, sway = calm || drag ? 0 : Math.sin(ph) * 4.5, nod = calm || drag || !glc ? 0 : Math.cos(ph * 0.8) * 1.6;
    var tRy = base + (drag ? drag.off : hx * (glc ? 15 : 20) + tilt + sway), tRx = drag ? 0 : -hy * (glc ? 10 : 13) + nod;
    var idle = !drag && settled && Math.abs(tRy - ry) < 7;
    // in Ruhe (nur das leise Schwanken) genügt jedes zweite Bild: das schont den Akku
    if (glc && idle && (skip = !skip)) { raf = requestAnimationFrame(frame); return; }
    last = now;
    var k = 1 - Math.exp(-dt * (drag ? 42 : settled ? 3.7 : 2.8));       // nach Zeit, nicht nach Bildern: gleich schnell auf jedem Gerät
    ry += (tRy - ry) * k; rx += (tRx - rx) * k;
    if (!settled && Math.abs(tRy - ry) < 1) settled = true;
    // Rechenlast: dauern die Bilder zu lang, wird die Glasmünze kleiner gerechnet
    // (erst nach anhaltend weniger als etwa 22 Bildern je Sekunde; ein einzelner Ruckler beim Laden zählt nicht)
    if (glc && !idle) {
      load = load * 0.9 + dt * 0.1;
      if (++frames > 30 && load > 0.045 && glc.quality() > 0.46) { glc.quality(glc.quality() * 0.78); sizeGL(); frames = 0; load = 0.02; }
    }
    apply();
    raf = requestAnimationFrame(frame);
  }
  function wake() { if (!raf && !calm) raf = requestAnimationFrame(frame); }
  function flip(dir) {
    needBack();
    base += 180 * (dir || 1);
    label();
    if (calm) { ry = base; rx = 0; apply(); } else wake();
  }
  function onScroll() {
    if (!visible) return;
    var r = stage.getBoundingClientRect(), mid = (r.top + r.height / 2) / window.innerHeight;       // 0 = oben, 1 = unten
    tilt = (0.5 - mid) * (glc ? 26 : 46);
  }

  /* ---- Glas ---- */
  function backLines() { return [t('coin.back.k'), 'proof, not promise', t('coin.back.d')]; }
  function needBack() { if (glc && !backDone) { backDone = true; glc.back(backLines()); apply(); } }
  function sizeGL() { if (glc && stage.clientWidth) glc.resize(canvas.clientWidth || stage.clientWidth * 1.18); }
  /** Beim ersten Öffnen der Seite: WebGL versuchen und die Höhenkarten rechnen. Scheitert es, bleibt die gezeichnete Münze. */
  function glass() {
    if (tried) return;
    tried = true;
    var path = document.querySelector('#y-shape path');
    glc = canvas && path ? CoinGL.mount(canvas, function () { sizeGL(); apply(); }) : null;
    if (!glc) { root.classList.add('is-css'); return; }
    glc.front(path.getAttribute('d'));
    root.classList.add('is-gl');
    sizeGL();
    // die Rückseite liegt zuerst hinten: ihre Karte wird gerechnet, wenn die Schrift da ist und der Auftritt vorbei ist,
    // spätestens aber, sobald jemand die Münze wendet
    var later = function () { setTimeout(needBack, calm ? 0 : 1400); };
    if (document.fonts && document.fonts.load) document.fonts.load('500 40px "Geist Mono"').then(later, later); else later();
    if (calm) { ry = base; rx = 0; }
    apply();
  }

  function init() {
    root = document.getElementById('coin'); if (!root) return;
    stage = document.getElementById('coin-stage'); body = document.getElementById('coin-body'); btn = document.getElementById('coin-turn');
    canvas = document.getElementById('coin-gl');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // gezeichnete Fassung: der Rand aus dünnen Scheiben hintereinander
    var edge = U.$('.coinx__edge', root), i;
    for (i = 0; i < LAYERS; i++) {
      var l = document.createElement('i');
      l.setAttribute('data-z', (i / (LAYERS - 1) - 0.5).toFixed(4));
      edge.appendChild(l);
    }
    function sizeEdge() {
      var w = stage.clientWidth; if (!w) return;
      var th = w * 0.052;
      U.$$('i', edge).forEach(function (l) { l.style.transform = 'translateZ(' + (Number(l.getAttribute('data-z')) * (th - 1.2)).toFixed(2) + 'px)'; });
      sizeGL(); if (glc) apply();
    }
    sizeEdge();
    if (window.ResizeObserver) new ResizeObserver(sizeEdge).observe(stage);
    label();
    if (calm) { ry = 0; rx = 0; }
    if (Router.current() === 'ysr') glass();
    apply();
    btn.addEventListener('click', function () { flip(1); });
    U.on('lang', function () { label(); if (glc && backDone) { glc.back(backLines()); apply(); } });
    U.on('route', function (r) {
      if (r.page !== 'ysr') return;
      glass();                                    // sofort, damit die Seite gleich mit der richtigen Münze erscheint
      setTimeout(function () { sizeEdge(); onScroll(); apply(); wake(); }, 40);
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (l) {
        visible = l[0].isIntersecting;
        if (visible) { glass(); if (!seen) { seen = true; t0 = performance.now(); } onScroll(); apply(); wake(); }
      }, { threshold: 0.05 }).observe(stage);
    } else { visible = true; glass(); wake(); }
    window.addEventListener('scroll', function () { if (Router.current() === 'ysr') onScroll(); }, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) wake(); });
    if (calm) return;
    // dem Zeiger folgen (nur mit Maus)
    stage.addEventListener('pointermove', function (e) {
      if (drag) {
        var dx = e.clientX - drag.x;
        vel = e.clientX - drag.last; drag.last = e.clientX;
        drag.off = dx * 0.62;
        if (Math.abs(dx) > 6) drag.moved = true;
        return;
      }
      if (e.pointerType !== 'mouse') return;
      var r = stage.getBoundingClientRect();
      hx = (e.clientX - r.left) / r.width * 2 - 1; hy = (e.clientY - r.top) / r.height * 2 - 1;
    });
    stage.addEventListener('pointerleave', function () { hx = 0; hy = 0; });
    // mit Finger oder Maus drehen
    stage.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      needBack();
      drag = { x: e.clientX, last: e.clientX, off: 0, moved: false, id: e.pointerId };
      vel = 0; stage.classList.add('is-drag');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      wake();
    });
    function end() {
      if (!drag) return;
      var total = base + drag.off + vel * 9, snapped = Math.round(total / 180) * 180;
      ry = base + drag.off; base = snapped; drag = null; stage.classList.remove('is-drag');
      label(); wake();
    }
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
  }
  /** Nur für Prüfläufe und Bildausgabe: die Glasmünze in einer festen Lage zeichnen (Grad). */
  function pose(a, b, c) { if (glc) glc.draw(a, b, c); return !!glc; }
  return { init: init, pose: pose };
})();

/* ---- 58-doc.js ---- */
/*
 * Dokumentseiten (Anleitungen, Protokoll, Whitepaper, Impressum, Datenschutz):
 * Inhaltsverzeichnis aus den Überschriften, Lesefortschritt, Zahlen in der Schreibweise der gewählten Sprache,
 * die laufende Epoche in der Tabelle, Druckknopf nur außerhalb eines Rahmens.
 */
var Doc = (function () {
  'use strict';
  var DOCS = ['guides', 'protocol', 'paper', 'imprint', 'privacy'], prog, wide, io = null, heads = [];
  var paperPick = null;                                 // vom Besucher gewählte Fassung des Whitepapers ('en' | 'de'), sonst folgt sie der Sprache der Seite

  function visible(e) { return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); }
  /** Zahlen wie auf der heutigen Seite: data-n = Wert, data-nd = höchste Zahl der Nachkommastellen. */
  function numbers() {
    U.$$('[data-n]').forEach(function (e) {
      var nd = Number(e.getAttribute('data-nd') || 2);
      e.textContent = Number(e.getAttribute('data-n')).toLocaleString(U.loc(), { maximumFractionDigits: nd });
    });
    var era = Math.floor(Number(Live.S.summary.height) / U.EPOCH);
    U.$$('[data-aera]').forEach(function (r) { r.classList.toggle('is-now', Number(r.getAttribute('data-aera')) === era); });
  }
  /** Überschriften der sichtbaren Sprachfassung einsammeln, Anker vergeben, Verzeichnis schreiben. */
  function toc(page) {
    var box = U.$('[data-doc="' + page + '"]'); if (!box) return;
    var links = U.$('.doc__links', box), list = U.$$('.doc__text h2', box).filter(visible), n = 0;
    heads = list;
    list.forEach(function (h) {
      n++;
      if (!h.id) h.id = page + '-s' + n;
      // Kapitelnummer absetzen ("7. Issuance")
      if (!h._num && !h.hasAttribute('data-t')) {
        var m = /^(\d+)\.\s+(.*)$/.exec(h.textContent);
        if (m) { h.textContent = ''; h.appendChild(U.el('span', { 'class': 'doc__num', text: m[1].length < 2 ? '0' + m[1] : m[1] })); h.appendChild(document.createTextNode(m[2])); h._label = m[2]; h._no = m[1]; }
        h._num = true;
      }
    });
    if (!links) return;
    links.textContent = '';
    list.forEach(function (h) {
      var a = U.el('a', { href: '#' + h.id });
      if (h._no) a.appendChild(U.el('i', { text: h._no }));
      a.appendChild(document.createTextNode(h._label || h.textContent));
      links.appendChild(a);
    });
    spy(box);
  }
  function spy(box) {
    if (io) { io.disconnect(); io = null; }
    if (!('IntersectionObserver' in window)) return;
    var links = U.$$('.doc__links a', box);
    io = new IntersectionObserver(function () {
      var best = -1, i, top;
      for (i = 0; i < heads.length; i++) { top = heads[i].getBoundingClientRect().top; if (top < window.innerHeight * 0.35) best = i; }
      links.forEach(function (a, k) { a.classList.toggle('is-here', k === best); });
    }, { rootMargin: '-10% 0px -60% 0px', threshold: [0, 1] });
    heads.forEach(function (h) { io.observe(h); });
  }
  function progress() {
    if (!prog) return;
    var page = Router.current(), on = DOCS.indexOf(page) >= 0 && page !== 'imprint' && page !== 'privacy';
    prog.hidden = !on;
    if (!on) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    prog.style.setProperty('--p', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : 0);
  }
  function open() { U.$$('.doc__toc details').forEach(function (d) { if (wide.matches) d.open = true; else d.open = false; }); }
  /**
   * Das Whitepaper gibt es auf Englisch und Deutsch. Es folgt der Sprache der Seite (Deutsch, sonst Englisch);
   * die beiden Knöpfe wählen die andere Fassung, ohne die Sprache der Seite zu ändern.
   */
  function paper() {
    var box = U.$('[data-doc="paper"] .doc__text'); if (!box) return;
    var site = I18n.lang(), shown = paperPick || (site === 'de' ? 'de' : 'en');
    box.setAttribute('data-show-lang', shown);
    U.$$('[data-paper]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-paper') === shown ? 'true' : 'false'); });
    U.$$('[data-paper-pick]').forEach(function (e) { e.hidden = false; });
    U.$$('[data-paper-note]').forEach(function (e) { e.hidden = site === 'de' || site === 'en'; });
  }
  function show(page) {
    if (DOCS.indexOf(page) < 0) { progress(); return; }
    if (page === 'paper') paper();
    numbers(); toc(page); open(); progress();
  }
  function init() {
    prog = U.el('i', { 'class': 'doc__prog', 'aria-hidden': 'true', hidden: '' });
    document.body.appendChild(prog);
    wide = window.matchMedia('(min-width:1000px)');
    if (wide.addEventListener) wide.addEventListener('change', open);
    // im Verzeichnis antippen: auf dem Handy danach wieder zuklappen
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.doc__links a');
      if (a && !wide.matches) { var d = a.closest('details'); if (d) d.open = false; }
    });
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-paper]');
      if (b) { paperPick = b.getAttribute('data-paper'); show('paper'); }
    });
    // Drucken gibt es nur, wenn die Seite nicht in einem Rahmen läuft
    var framed = true;
    try { framed = window.self !== window.top; } catch (e) { framed = true; }
    U.$$('[data-print]').forEach(function (box) {
      if (framed || !window.print) return;
      box.hidden = false;
      box.addEventListener('click', function (e) { if (e.target.closest('button')) window.print(); });
    });
    window.addEventListener('scroll', progress, { passive: true });
    U.on('route', function (r) { setTimeout(function () { show(r.page); }, 30); });
    U.on('lang', function () { setTimeout(function () { show(Router.current()); }, 30); });
    U.on('data', numbers);
    show(Router.current());
  }
  return { init: init };
})();

/* ---- 59-miles.js ---- */
/*
 * Geschichte: die Wegmarken der Kette nach Blockhöhe. Die Abstände folgen grob der Zahl der Blöcke dazwischen,
 * der Stand von heute kommt aus der Kette. Beim Scrollen läuft die Linie bis zum heutigen Block mit; was danach kommt, wartet.
 */
var Miles = (function () {
  'use strict';
  var root, items = [], VOTE = Date.UTC(2026, 9, 25, 12) / 1000, calm = false, tipIndex = 0, shown = -1;

  function heightAt(ts) {
    var c = Chain.get(), lo = 0, hi = c.n - 1, mid, rel = ts - c.t0;
    while (lo < hi) { mid = (lo + hi + 1) >> 1; if (c.T[mid] <= rel) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function layout() {
    var c = Chain.get(), tip = Number(Live.S.summary.height), prev = null;
    items.forEach(function (li, i) {
      var at = li.getAttribute('data-h'), h = at === 'tip' ? tip : at === 'vote' ? heightAt(VOTE) : Number(at);
      li._h = h;
    });
    // der heutige Block steht an seiner Stelle zwischen den festen Marken
    items.sort(function (a, b) { return a._h - b._h || (a.getAttribute('data-h') === 'tip' ? 1 : -1); });
    items.forEach(function (li, i) {
      root.appendChild(li);
      var h = li._h, isTip = li.getAttribute('data-h') === 'tip', past = h <= tip, k = U.$('.miles__k', li), next = items[i + 1];
      li.classList.toggle('is-tip', isTip); li.classList.toggle('is-past', past && !isTip); li.classList.toggle('is-next', !past);
      if (isTip) tipIndex = i;
      li.style.setProperty('--gap', next ? Math.round(Math.max(56, Math.min(240, (next._h - h) * 0.075))) + 'px' : '0px');
      var when = past ? (h < c.n ? U.date(c.t0 + c.T[h]) : '') : t('miles.left', { n: U.num(h - tip) });
      k.textContent = '';
      k.appendChild(U.el('b', { text: t('walk.tip.block', { h: U.num(h) }) }));
      k.appendChild(U.el('span', { text: isTip ? t('pulse.now') : when }));
      U.$$('[data-when]', li).forEach(function (x) { x.hidden = (x.getAttribute('data-when') === 'future') !== !past; });
    });
    light(true);
  }
  /** Die Linie läuft bis zu der Marke, die beim Scrollen zuletzt erreicht wurde, höchstens bis zum heutigen Block. */
  function light(force) {
    var top = root.getBoundingClientRect().top, lim = window.innerHeight * 0.7, k = 0, i;
    if (calm || !window.ScrollTrigger) k = tipIndex + 1;
    else for (i = 0; i <= tipIndex; i++) if (top + items[i].offsetTop < lim) k = i + 1;
    if (k === shown && !force) return;
    shown = k;
    items.forEach(function (li, j) { li.classList.toggle('on', j < k); });
    var last = items[Math.max(0, k - 1)];
    root.style.setProperty('--len', (k ? last.offsetTop - items[0].offsetTop : 0) + 'px');
  }
  function init() {
    root = document.getElementById('miles'); if (!root) return;
    items = U.$$('li', root);
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    layout();
    if (!calm && window.ScrollTrigger) ScrollTrigger.create({ trigger: root, start: 'top bottom', end: 'bottom top', onUpdate: function () { light(false); } });
    U.on('data', layout);
    U.on('lang', layout);
    U.on('route', function (r) { if (r.page === 'story') setTimeout(function () { light(true); if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 60); });
  }
  return { init: init };
})();

/* ---- 60-forge.js ---- */
/*
 * Seite „Die Kette“, Szene „Ein Block, drei Schritte“: der Kopf des neuesten Blocks, Byte für Byte.
 * 1 Miner suchen: die Nonce (warm) wechselt, der Hash darunter springt. 2 Knoten prüfen: Nonce und Hash des echten Blocks
 * stehen fest, ein Licht je gemeldetem Knoten geht an. 3 Der Block zahlt aus: er nimmt seinen Platz am Ende der Kette ein
 * und zahlt an so viele Adressen, wie dieser Block bezahlt hat.
 * Echt sind: Kopf, Hash, Ziel und das Ergebnis der Prüfung (hier im Browser gerechnet), die Zahl der Knoten, Belohnung und
 * Zahl der Empfänger, die Blöcke davor mit ihren Zeitabständen. Darstellung sind: das Springen der Nonce und die Reihenfolge,
 * in der die Lichter angehen.
 */
var Forge = (function () {
  'use strict';
  var root, canvas, ctx, W = 0, H = 0, dpr = 1, wide = false, cur = null, fontOk = false, checkAt = 0;
  var box = { x: 0, y: 0, w: 0, h: 0, cw: 0, ch: 0 };
  var HEX = '0123456789abcdef', LAMP = '#FFC47A';

  function rnd(i, s) { var x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function ease(x) { return x * x * (3 - 2 * x); }
  function zeros(s) { var z = 0; while (z < s.length && s.charAt(z) === '0') z++; return z; }

  /** Der neueste Block, einmal je Block im Browser nachgerechnet. */
  function block() {
    var bl = Live.S.blocks, b = bl && bl[0], i;
    if (!b || !b.header) return cur;
    if (!cur || cur.height !== b.height) {
      var v = U.verifyHeader(b.header), t0 = Number(b.timestamp), prev = [];
      for (i = 1; i < bl.length && prev.length < 8; i++) prev.push({ h: bl[i].height, dt: Math.max(0, t0 - Number(bl[i].timestamp)) });
      cur = { height: b.height, bytes: v.header.bytes, hash: v.hash, target: v.target, zh: zeros(v.hash), zt: zeros(v.target),
        valid: v.valid === true, paid: Math.max(1, Number(b.recipients || 1)), reward: b.reward, prev: prev };
    }
    return cur;
  }
  function size() {
    var r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    wide = W >= 900;
    var room = wide ? Math.min(W * 0.4, 560) : Math.min(W - 40, 420);
    var bw = Math.min(room, H * 0.3 / 8 / 0.95 * 17);                 // niedrige Fenster: das Raster bleibt im oberen Drittel
    box.cw = bw / 17; box.ch = box.cw * 0.95; box.w = bw; box.h = box.ch * 8;
    box.x = wide ? W * 0.56 + (room - bw) / 2 : (W - bw) / 2;
    box.y = wide ? Math.max(96, H * 0.5 - box.h / 2 - 84) : Math.max(84, H * 0.17);
  }
  function mono(px, w) { return (w || 500) + ' ' + px.toFixed(1) + 'px ' + (fontOk ? '"Geist Mono",' : '') + 'ui-monospace,Menlo,Consolas,monospace'; }
  function split(txt, x, y, px, n, colA, colB) {
    ctx.font = mono(px); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    var a = txt.slice(0, n);
    ctx.fillStyle = colA; ctx.fillText(a, x, y);
    ctx.fillStyle = colB; ctx.fillText(txt.slice(n), x + ctx.measureText(a).width, y);
  }
  function glow(x, y, r, rgb, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  function draw(f, api) {
    var B = block(); if (!B) return false;
    var now = performance.now() / 1000, k = function (a, b) { return clamp((f - a) / (b - a)); };
    var found = api.calm || f >= 0.6, fold = ease(k(1.25, 1.65)), pay = k(1.58, 1.86), check, i, x, y;
    if (api.calm) check = 1;
    else if (f < 0.7) { checkAt = 0; check = 0; }
    else { if (!checkAt) checkAt = now; check = clamp((now - checkAt) / 1.5); }
    var tick = Math.floor(now * 16), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    var px = Math.max(8.5, Math.min(14, box.w / 64 / 0.6)), lw = 64 * px * 0.6, lx = cx - lw / 2, ly = box.y + box.h + (wide ? 46 : 34);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);

    /* ---- der Kopf: 136 Byte, darunter Hash und Ziel ---- */
    if (fold < 1) {
      ctx.save();
      if (fold > 0) { var s = 1 - fold * 0.72; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy); }
      ctx.globalAlpha = 1 - fold;
      ctx.font = mono(box.cw * 0.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (i = 0; i < 136; i++) {
        x = box.x + (i % 17 + 0.5) * box.cw; y = box.y + (Math.floor(i / 17) + 0.5) * box.ch;
        var v = B.bytes[i], nonce = i >= 128;
        if (nonce && !found) v = Math.floor(rnd(i, tick) * 256);
        if (nonce && found) { ctx.fillStyle = 'rgba(255,196,122,.16)'; ctx.fillRect(x - box.cw * 0.46, y - box.ch * 0.4, box.cw * 0.92, box.ch * 0.8); }
        ctx.fillStyle = nonce ? LAMP : i >= 120 ? 'rgba(255,196,122,.72)' : 'rgba(226,236,255,.62)';
        ctx.fillText(HEX.charAt(v >> 4) + HEX.charAt(v & 15), x, y);
      }
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t('forge.hash'), lx, ly - px * 1.5);
      if (!found) {
        var str = '', q; for (q = 0; q < 64; q++) str += HEX.charAt(Math.floor(rnd(q, tick + 7) * 16));
        split(str, lx, ly, px, 0, LAMP, 'rgba(212,226,255,.5)');
      } else split(B.hash, lx, ly, px, B.zh, LAMP, '#EEF4FF');
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)';
      ctx.fillText(t('forge.target'), lx, ly + px * 1.7);
      split(B.target, lx, ly + px * 3.2, px, B.zt, 'rgba(255,196,122,.6)', 'rgba(212,226,255,.5)');
      if (found && B.valid) {
        ctx.font = mono(px * 0.95, 500); ctx.fillStyle = '#5BE3AB';
        ctx.fillText(t('forge.ok'), lx, ly + px * 5.3);
      }
      ctx.restore();
    }

    /* ---- die Knoten: ein Licht je gemeldetem Knoten, eines nach dem anderen ---- */
    var rowA = (api.calm ? 1 : k(0.6, 0.78)) * (1 - fold);
    if (rowA > 0.01) {
      var n = Math.max(1, Math.min(480, Number(Live.S.summary.knoten || 0))), per = Math.max(2, Math.floor(lw / 10) + 1);
      var rows = Math.ceil(n / per), ry = ly + px * 8.2;
      for (i = 0; i < n; i++) {
        var col = i % per, inRow = Math.min(per, n - Math.floor(i / per) * per);
        x = inRow === 1 ? lx : lx + lw * col / (Math.max(inRow, per > n ? n : per) - 1);
        y = ry + Math.floor(i / per) * 13;
        var on = clamp(check * (n + 3) - i);
        ctx.globalAlpha = rowA;
        if (on > 0) glow(x, y, 9, '99,216,255', 0.34 * on);
        if (on > 0 && on < 1) {
          ctx.strokeStyle = 'rgba(159,230,255,' + (0.7 * (1 - on)).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 3 + 9 * on, 0, 6.2832); ctx.stroke();
        }
        ctx.fillStyle = on >= 0.5 ? '#9FE6FF' : 'rgba(170,198,255,.42)';
        ctx.beginPath(); ctx.arc(x, y, on >= 0.5 ? 2.5 : 1.9, 0, 6.2832); ctx.fill();
      }
      ctx.font = mono(px * 0.86, 400); ctx.fillStyle = 'rgba(212,226,255,.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(tn('forge.nodes', n, { n: U.num(n) }), lx, ry + (rows - 1) * 13 + px * 2);
      ctx.globalAlpha = 1;
    }

    /* ---- der Block am Ende der Kette, davor die letzten Blöcke im Abstand ihres Fundes ---- */
    if (fold > 0) {
      var L = box.w / 2, prev = B.prev, span = prev.length ? Math.max(1, prev[prev.length - 1].dt) : 1, R = box.w * 0.42;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(150,186,255,' + (0.3 * fold).toFixed(3) + ')'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx - L, cy); ctx.lineTo(cx, cy); ctx.stroke();
      for (i = 0; i < prev.length; i++) {
        var a = clamp(fold * 2 - i / prev.length);
        if (a <= 0) continue;
        x = cx - prev[i].dt / span * L;
        glow(x, cy, 10, '99,216,255', 0.3 * a);
        ctx.globalAlpha = a; ctx.fillStyle = '#9FE6FF';
        ctx.beginPath(); ctx.arc(x, cy, 2.5, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
      }
      glow(cx, cy, 54, '255,196,122', 0.55 * fold);
      glow(cx, cy, 14, '255,240,214', 0.95 * fold);
      ctx.font = mono(12, 500); ctx.fillStyle = 'rgba(255,196,122,' + fold.toFixed(3) + ')'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(t('walk.tip.block', { h: U.num(B.height) }), cx, cy - 64);
      // Auszahlung: ein Strahl je bezahlter Adresse
      if (pay > 0) {
        var m = Math.min(B.paid, 96);
        for (i = 0; i < m; i++) {
          var ang = m === 1 ? Math.PI * 0.5 : Math.PI * (0.14 + 0.72 * i / (m - 1)), len = R;
          var p = clamp(pay * 1.5 - i / m * 0.5);
          if (p <= 0) continue;
          var x0 = cx + Math.cos(ang) * 16, y0 = cy + Math.sin(ang) * 16, x1 = cx + Math.cos(ang) * len, y1 = cy + Math.sin(ang) * len;
          ctx.strokeStyle = 'rgba(255,196,122,' + (0.45 * p).toFixed(3) + ')'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p); ctx.stroke();
          if (p >= 1) { glow(x1, y1, 8, '255,196,122', 0.3); ctx.fillStyle = '#FFD9A6'; ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, 6.2832); ctx.fill(); }
        }
        var la = clamp(pay * 2 - 1);
        if (la > 0) {
          ctx.textAlign = 'center';
          ctx.font = mono(Math.max(11, px * 0.95), 500); ctx.fillStyle = 'rgba(255,196,122,' + la.toFixed(3) + ')';
          ctx.fillText(tn('forge.paid', B.paid, { r: U.ysr(B.reward), n: U.num(B.paid) }), cx, cy + R + 34);
          if (prev.length) {
            ctx.font = mono(Math.max(9.5, px * 0.8), 400); ctx.fillStyle = 'rgba(212,226,255,' + (0.5 * la).toFixed(3) + ')';
            ctx.fillText(t('forge.before', { n: U.num(prev.length), m: U.num(Math.round(span / 60)) }), cx, cy + R + 56);
          }
        }
      }
    }
    return !found || (check > 0 && check < 1);
  }
  function init() {
    root = document.getElementById('forge'); if (!root) return;
    canvas = U.$('canvas', root); ctx = canvas.getContext('2d'); size();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontOk = true; });
    Steps.mount(root, draw, { onSize: size, calmAt: 1 });
  }
  return { init: init };
})();

/* ---- 61-term.js ---- */
/*
 * Seite „Entwickeln“: eine echte Anfrage und ihre Antwort. Gezeigt wird /summary so, wie die öffentliche API sie liefert
 * (live gelesen, sonst die letzte Antwort, die die Seite kennt). Kommt ein neuer Block, ändert sich die Antwort.
 */
var Term = (function () {
  'use strict';
  var box, pre, note, more, shown = '', seen = false, calm = false, timer = 0, lines = [], open = false, CUT = 16;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  /** Eine JSON-Zeile mit leichter Auszeichnung: Schlüssel gedämpft, Zahlen kalt, Text warm. Der Einzug bleibt beim Umbruch stehen. */
  function row(line) {
    var indent = line.length - line.replace(/^ +/, '').length;
    var html = esc(line).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)/g, function (m, str, colon, num) {
      if (str) return colon ? '<span class="tk">' + str + '</span>' + colon : '<span class="ts">' + str + '</span>';
      return '<span class="tn">' + num + '</span>';
    });
    return '<span class="ln" style="--in:' + indent + 'ch">' + html + '</span>';
  }
  function head() { return '<span class="ln" style="--in:0ch"><span class="tp">$</span> curl ' + esc(Live.PUBLIC) + '/summary</span>'; }
  function put(n) { pre.innerHTML = head() + lines.slice(0, n).join(''); }
  function labels() {
    note.textContent = Live.S.mode === 'live' ? t('term.note.live', { d: U.date(Live.S.at, true) }) : t('term.note.snap', { d: Live.values().snapDate });
    more.textContent = t(open ? 'term.less' : 'term.more', { n: U.num(lines.length + 1) });
    more.hidden = lines.length + 1 <= CUT + 2;
    box.classList.toggle('is-cut', !open && !more.hidden);
  }
  function render(animate) {
    var json = JSON.stringify(Live.S.summary, null, 2);
    if (json !== shown) {
      shown = json; lines = json.split('\n').map(row);
      clearInterval(timer);
      if (!animate || calm) put(lines.length);
      else {
        var i = 0; put(0);
        timer = setInterval(function () { i += 1; put(i); if (i >= lines.length) clearInterval(timer); }, 34);
      }
    }
    labels();
  }
  function init() {
    pre = document.getElementById('term-out'); if (!pre) return;
    box = document.getElementById('term-box'); note = document.getElementById('term-note'); more = document.getElementById('term-more');
    calm = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    more.addEventListener('click', function () { open = !open; more.setAttribute('aria-expanded', open ? 'true' : 'false'); labels(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (l, io) { if (l[0].isIntersecting) { seen = true; render(true); io.disconnect(); } }, { threshold: 0.2 }).observe(box);
    } else { seen = true; render(false); }
    U.on('data', function () { if (seen) render(false); });
    U.on('lang', function () { if (seen) labels(); });
  }
  return { init: init };
})();

/* ---- 99-init.js ---- */
/* Start. Jede Baugruppe startet für sich; fällt eine aus, laufen die anderen weiter. */
(function () {
  'use strict';
  function run(name, fn) {
    try { fn(); } catch (e) { if (window.console) console.error('[YSKAR] ' + name, e); }
  }
  function boot() {
    run('Bilder', function () { Img.init(); });
    run('Seiten', function () { Router.init(); });
    run('Bedienung', function () { UI.init(); });
    run('Verlauf', function () { Chain.init(); });
    run('Kettendaten', function () { Live.start(); });
    ['Proof', 'Sky', 'Walk', 'Prover', 'TryMine', 'Supply', 'Field', 'Phone', 'Pay', 'Pools', 'Shore', 'Log', 'Road', 'Coin', 'Doc', 'Miles', 'Forge', 'Term', 'Tech', 'Miner', 'Ysr', 'Mining', 'Net', 'Explorer', 'Dev', 'Charts', 'Early', 'Scenes'].forEach(function (n) {
      if (typeof window[n] !== 'undefined' && window[n] && window[n].init) run(n, function () { window[n].init(); });
    });
    window.__booted = true;
    document.documentElement.classList.add('ready');
  }
  /* Erst die Texte der gewählten Sprache (sie stehen sofort auf der Seite), dann der Stand der Kette, dann das Programm. */
  function begin() { I18n.ready(function () { run('Sprache', function () { I18n.init(); }); Live.prime(boot); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin); else begin();
})();

