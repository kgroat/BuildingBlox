require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/**
 * interact.js v1.2.4
 *
 * Copyright (c) 2012-2015 Taye Adeyemi <dev@taye.me>
 * Open source under the MIT License.
 * https://raw.github.com/taye/interact.js/master/LICENSE
 */
(function (realWindow) {
    'use strict';

    var // get wrapped window if using Shadow DOM polyfill
        window = (function () {
            // create a TextNode
            var el = realWindow.document.createTextNode('');

            // check if it's wrapped by a polyfill
            if (el.ownerDocument !== realWindow.document
                && typeof realWindow.wrap === 'function'
                && realWindow.wrap(el) === el) {
                // return wrapped window
                return realWindow.wrap(realWindow);
            }

            // no Shadow DOM polyfil or native implementation
            return realWindow;
        }()),

        document           = window.document,
        DocumentFragment   = window.DocumentFragment   || blank,
        SVGElement         = window.SVGElement         || blank,
        SVGSVGElement      = window.SVGSVGElement      || blank,
        SVGElementInstance = window.SVGElementInstance || blank,
        HTMLElement        = window.HTMLElement        || window.Element,

        PointerEvent = (window.PointerEvent || window.MSPointerEvent),
        pEventTypes,

        hypot = Math.hypot || function (x, y) { return Math.sqrt(x * x + y * y); },

        tmpXY = {},     // reduce object creation in getXY()

        documents       = [],   // all documents being listened to

        interactables   = [],   // all set interactables
        interactions    = [],   // all interactions

        dynamicDrop     = false,

        // {
        //      type: {
        //          selectors: ['selector', ...],
        //          contexts : [document, ...],
        //          listeners: [[listener, useCapture], ...]
        //      }
        //  }
        delegatedEvents = {},

        defaultOptions = {
            base: {
                accept        : null,
                actionChecker : null,
                styleCursor   : true,
                preventDefault: 'auto',
                origin        : { x: 0, y: 0 },
                deltaSource   : 'page',
                allowFrom     : null,
                ignoreFrom    : null,
                _context      : document,
                dropChecker   : null
            },

            drag: {
                enabled: false,
                manualStart: true,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                axis: 'xy',
            },

            drop: {
                enabled: false,
                accept: null,
                overlap: 'pointer'
            },

            resize: {
                enabled: false,
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: null,
                restrict: null,
                inertia: null,
                autoScroll: null,

                square: false,
                axis: 'xy',

                // object with props left, right, top, bottom which are
                // true/false values to resize when the pointer is over that edge,
                // CSS selectors to match the handles for each direction
                // or the Elements for each handle
                edges: null,

                // a value of 'none' will limit the resize rect to a minimum of 0x0
                // 'negate' will alow the rect to have negative width/height
                // 'reposition' will keep the width/height positive by swapping
                // the top and bottom edges and/or swapping the left and right edges
                invert: 'none'
            },

            gesture: {
                manualStart: false,
                enabled: false,
                max: Infinity,
                maxPerElement: 1,

                restrict: null
            },

            perAction: {
                manualStart: false,
                max: Infinity,
                maxPerElement: 1,

                snap: {
                    enabled     : false,
                    endOnly     : false,
                    range       : Infinity,
                    targets     : null,
                    offsets     : null,

                    relativePoints: null
                },

                restrict: {
                    enabled: false,
                    endOnly: false
                },

                autoScroll: {
                    enabled     : false,
                    container   : null,     // the item that is scrolled (Window or HTMLElement)
                    margin      : 60,
                    speed       : 300       // the scroll speed in pixels per second
                },

                inertia: {
                    enabled          : false,
                    resistance       : 10,    // the lambda in exponential decay
                    minSpeed         : 100,   // target speed must be above this for inertia to start
                    endSpeed         : 10,    // the speed at which inertia is slow enough to stop
                    allowResume      : true,  // allow resuming an action in inertia phase
                    zeroResumeDelta  : true,  // if an action is resumed after launch, set dx/dy to 0
                    smoothEndDuration: 300    // animate to snap/restrict endOnly if there's no inertia
                }
            },

            _holdDuration: 600
        },

        // Things related to autoScroll
        autoScroll = {
            interaction: null,
            i: null,    // the handle returned by window.setInterval
            x: 0, y: 0, // Direction each pulse is to scroll in

            // scroll the window by the values in scroll.x/y
            scroll: function () {
                var options = autoScroll.interaction.target.options[autoScroll.interaction.prepared.name].autoScroll,
                    container = options.container || getWindow(autoScroll.interaction.element),
                    now = new Date().getTime(),
                    // change in time in seconds
                    dt = (now - autoScroll.prevTime) / 1000,
                    // displacement
                    s = options.speed * dt;

                if (s >= 1) {
                    if (isWindow(container)) {
                        container.scrollBy(autoScroll.x * s, autoScroll.y * s);
                    }
                    else if (container) {
                        container.scrollLeft += autoScroll.x * s;
                        container.scrollTop  += autoScroll.y * s;
                    }

                    autoScroll.prevTime = now;
                }

                if (autoScroll.isScrolling) {
                    cancelFrame(autoScroll.i);
                    autoScroll.i = reqFrame(autoScroll.scroll);
                }
            },

            edgeMove: function (event) {
                var interaction,
                    target,
                    doAutoscroll = false;

                for (var i = 0; i < interactions.length; i++) {
                    interaction = interactions[i];

                    if (interaction.interacting()
                        && checkAutoScroll(interaction.target, interaction.prepared.name)) {

                        target = interaction.target;
                        doAutoscroll = true;
                        break;
                    }
                }

                if (!doAutoscroll) { return; }

                var top,
                    right,
                    bottom,
                    left,
                    options = target.options[interaction.prepared.name].autoScroll,
                    container = options.container || getWindow(interaction.element);

                if (isWindow(container)) {
                    left   = event.clientX < autoScroll.margin;
                    top    = event.clientY < autoScroll.margin;
                    right  = event.clientX > container.innerWidth  - autoScroll.margin;
                    bottom = event.clientY > container.innerHeight - autoScroll.margin;
                }
                else {
                    var rect = getElementRect(container);

                    left   = event.clientX < rect.left   + autoScroll.margin;
                    top    = event.clientY < rect.top    + autoScroll.margin;
                    right  = event.clientX > rect.right  - autoScroll.margin;
                    bottom = event.clientY > rect.bottom - autoScroll.margin;
                }

                autoScroll.x = (right ? 1: left? -1: 0);
                autoScroll.y = (bottom? 1:  top? -1: 0);

                if (!autoScroll.isScrolling) {
                    // set the autoScroll properties to those of the target
                    autoScroll.margin = options.margin;
                    autoScroll.speed  = options.speed;

                    autoScroll.start(interaction);
                }
            },

            isScrolling: false,
            prevTime: 0,

            start: function (interaction) {
                autoScroll.isScrolling = true;
                cancelFrame(autoScroll.i);

                autoScroll.interaction = interaction;
                autoScroll.prevTime = new Date().getTime();
                autoScroll.i = reqFrame(autoScroll.scroll);
            },

            stop: function () {
                autoScroll.isScrolling = false;
                cancelFrame(autoScroll.i);
            }
        },

        // Does the browser support touch input?
        supportsTouch = (('ontouchstart' in window) || window.DocumentTouch && document instanceof window.DocumentTouch),

        // Does the browser support PointerEvents
        supportsPointerEvent = !!PointerEvent,

        // Less Precision with touch input
        margin = supportsTouch || supportsPointerEvent? 20: 10,

        pointerMoveTolerance = 1,

        // for ignoring browser's simulated mouse events
        prevTouchTime = 0,

        // Allow this many interactions to happen simultaneously
        maxInteractions = Infinity,

        // Check if is IE9 or older
        actionCursors = (document.all && !window.atob) ? {
            drag    : 'move',
            resizex : 'e-resize',
            resizey : 's-resize',
            resizexy: 'se-resize',

            resizetop        : 'n-resize',
            resizeleft       : 'w-resize',
            resizebottom     : 's-resize',
            resizeright      : 'e-resize',
            resizetopleft    : 'se-resize',
            resizebottomright: 'se-resize',
            resizetopright   : 'ne-resize',
            resizebottomleft : 'ne-resize',

            gesture : ''
        } : {
            drag    : 'move',
            resizex : 'ew-resize',
            resizey : 'ns-resize',
            resizexy: 'nwse-resize',

            resizetop        : 'ns-resize',
            resizeleft       : 'ew-resize',
            resizebottom     : 'ns-resize',
            resizeright      : 'ew-resize',
            resizetopleft    : 'nwse-resize',
            resizebottomright: 'nwse-resize',
            resizetopright   : 'nesw-resize',
            resizebottomleft : 'nesw-resize',

            gesture : ''
        },

        actionIsEnabled = {
            drag   : true,
            resize : true,
            gesture: true
        },

        // because Webkit and Opera still use 'mousewheel' event type
        wheelEvent = 'onmousewheel' in document? 'mousewheel': 'wheel',

        eventTypes = [
            'dragstart',
            'dragmove',
            'draginertiastart',
            'dragend',
            'dragenter',
            'dragleave',
            'dropactivate',
            'dropdeactivate',
            'dropmove',
            'drop',
            'resizestart',
            'resizemove',
            'resizeinertiastart',
            'resizeend',
            'gesturestart',
            'gesturemove',
            'gestureinertiastart',
            'gestureend',

            'down',
            'move',
            'up',
            'cancel',
            'tap',
            'doubletap',
            'hold'
        ],

        globalEvents = {},

        // Opera Mobile must be handled differently
        isOperaMobile = navigator.appName == 'Opera' &&
            supportsTouch &&
            navigator.userAgent.match('Presto'),

        // scrolling doesn't change the result of
        // getBoundingClientRect/getClientRects on iOS <=7 but it does on iOS 8
        isIOS7orLower = (/iP(hone|od|ad)/.test(navigator.platform)
                            && /OS [1-7][^\d]/.test(navigator.appVersion)),

        // prefix matchesSelector
        prefixedMatchesSelector = 'matches' in Element.prototype?
                'matches': 'webkitMatchesSelector' in Element.prototype?
                    'webkitMatchesSelector': 'mozMatchesSelector' in Element.prototype?
                        'mozMatchesSelector': 'oMatchesSelector' in Element.prototype?
                            'oMatchesSelector': 'msMatchesSelector',

        // will be polyfill function if browser is IE8
        ie8MatchesSelector,

        // native requestAnimationFrame or polyfill
        reqFrame = realWindow.requestAnimationFrame,
        cancelFrame = realWindow.cancelAnimationFrame,

        // Events wrapper
        events = (function () {
            var useAttachEvent = ('attachEvent' in window) && !('addEventListener' in window),
                addEvent       = useAttachEvent?  'attachEvent': 'addEventListener',
                removeEvent    = useAttachEvent?  'detachEvent': 'removeEventListener',
                on             = useAttachEvent? 'on': '',

                elements          = [],
                targets           = [],
                attachedListeners = [];

            function add (element, type, listener, useCapture) {
                var elementIndex = indexOf(elements, element),
                    target = targets[elementIndex];

                if (!target) {
                    target = {
                        events: {},
                        typeCount: 0
                    };

                    elementIndex = elements.push(element) - 1;
                    targets.push(target);

                    attachedListeners.push((useAttachEvent ? {
                            supplied: [],
                            wrapped : [],
                            useCount: []
                        } : null));
                }

                if (!target.events[type]) {
                    target.events[type] = [];
                    target.typeCount++;
                }

                if (!contains(target.events[type], listener)) {
                    var ret;

                    if (useAttachEvent) {
                        var listeners = attachedListeners[elementIndex],
                            listenerIndex = indexOf(listeners.supplied, listener);

                        var wrapped = listeners.wrapped[listenerIndex] || function (event) {
                            if (!event.immediatePropagationStopped) {
                                event.target = event.srcElement;
                                event.currentTarget = element;

                                event.preventDefault = event.preventDefault || preventDef;
                                event.stopPropagation = event.stopPropagation || stopProp;
                                event.stopImmediatePropagation = event.stopImmediatePropagation || stopImmProp;

                                if (/mouse|click/.test(event.type)) {
                                    event.pageX = event.clientX + getWindow(element).document.documentElement.scrollLeft;
                                    event.pageY = event.clientY + getWindow(element).document.documentElement.scrollTop;
                                }

                                listener(event);
                            }
                        };

                        ret = element[addEvent](on + type, wrapped, Boolean(useCapture));

                        if (listenerIndex === -1) {
                            listeners.supplied.push(listener);
                            listeners.wrapped.push(wrapped);
                            listeners.useCount.push(1);
                        }
                        else {
                            listeners.useCount[listenerIndex]++;
                        }
                    }
                    else {
                        ret = element[addEvent](type, listener, useCapture || false);
                    }
                    target.events[type].push(listener);

                    return ret;
                }
            }

            function remove (element, type, listener, useCapture) {
                var i,
                    elementIndex = indexOf(elements, element),
                    target = targets[elementIndex],
                    listeners,
                    listenerIndex,
                    wrapped = listener;

                if (!target || !target.events) {
                    return;
                }

                if (useAttachEvent) {
                    listeners = attachedListeners[elementIndex];
                    listenerIndex = indexOf(listeners.supplied, listener);
                    wrapped = listeners.wrapped[listenerIndex];
                }

                if (type === 'all') {
                    for (type in target.events) {
                        if (target.events.hasOwnProperty(type)) {
                            remove(element, type, 'all');
                        }
                    }
                    return;
                }

                if (target.events[type]) {
                    var len = target.events[type].length;

                    if (listener === 'all') {
                        for (i = 0; i < len; i++) {
                            remove(element, type, target.events[type][i], Boolean(useCapture));
                        }
                    } else {
                        for (i = 0; i < len; i++) {
                            if (target.events[type][i] === listener) {
                                element[removeEvent](on + type, wrapped, useCapture || false);
                                target.events[type].splice(i, 1);

                                if (useAttachEvent && listeners) {
                                    listeners.useCount[listenerIndex]--;
                                    if (listeners.useCount[listenerIndex] === 0) {
                                        listeners.supplied.splice(listenerIndex, 1);
                                        listeners.wrapped.splice(listenerIndex, 1);
                                        listeners.useCount.splice(listenerIndex, 1);
                                    }
                                }

                                break;
                            }
                        }
                    }

                    if (target.events[type] && target.events[type].length === 0) {
                        target.events[type] = null;
                        target.typeCount--;
                    }
                }

                if (!target.typeCount) {
                    targets.splice(elementIndex);
                    elements.splice(elementIndex);
                    attachedListeners.splice(elementIndex);
                }
            }

            function preventDef () {
                this.returnValue = false;
            }

            function stopProp () {
                this.cancelBubble = true;
            }

            function stopImmProp () {
                this.cancelBubble = true;
                this.immediatePropagationStopped = true;
            }

            return {
                add: add,
                remove: remove,
                useAttachEvent: useAttachEvent,

                _elements: elements,
                _targets: targets,
                _attachedListeners: attachedListeners
            };
        }());

    function blank () {}

    function isElement (o) {
        if (!o || (typeof o !== 'object')) { return false; }

        var _window = getWindow(o) || window;

        return (/object|function/.test(typeof _window.Element)
            ? o instanceof _window.Element //DOM2
            : o.nodeType === 1 && typeof o.nodeName === "string");
    }
    function isWindow (thing) { return !!(thing && thing.Window) && (thing instanceof thing.Window); }
    function isDocFrag (thing) { return !!thing && thing instanceof DocumentFragment; }
    function isArray (thing) {
        return isObject(thing)
                && (typeof thing.length !== undefined)
                && isFunction(thing.splice);
    }
    function isObject   (thing) { return !!thing && (typeof thing === 'object'); }
    function isFunction (thing) { return typeof thing === 'function'; }
    function isNumber   (thing) { return typeof thing === 'number'  ; }
    function isBool     (thing) { return typeof thing === 'boolean' ; }
    function isString   (thing) { return typeof thing === 'string'  ; }

    function trySelector (value) {
        if (!isString(value)) { return false; }

        // an exception will be raised if it is invalid
        document.querySelector(value);
        return true;
    }

    function extend (dest, source) {
        for (var prop in source) {
            dest[prop] = source[prop];
        }
        return dest;
    }

    function copyCoords (dest, src) {
        dest.page = dest.page || {};
        dest.page.x = src.page.x;
        dest.page.y = src.page.y;

        dest.client = dest.client || {};
        dest.client.x = src.client.x;
        dest.client.y = src.client.y;

        dest.timeStamp = src.timeStamp;
    }

    function setEventXY (targetObj, pointer, interaction) {
        if (!pointer) {
            if (interaction.pointerIds.length > 1) {
                pointer = touchAverage(interaction.pointers);
            }
            else {
                pointer = interaction.pointers[0];
            }
        }

        getPageXY(pointer, tmpXY, interaction);
        targetObj.page.x = tmpXY.x;
        targetObj.page.y = tmpXY.y;

        getClientXY(pointer, tmpXY, interaction);
        targetObj.client.x = tmpXY.x;
        targetObj.client.y = tmpXY.y;

        targetObj.timeStamp = new Date().getTime();
    }

    function setEventDeltas (targetObj, prev, cur) {
        targetObj.page.x     = cur.page.x      - prev.page.x;
        targetObj.page.y     = cur.page.y      - prev.page.y;
        targetObj.client.x   = cur.client.x    - prev.client.x;
        targetObj.client.y   = cur.client.y    - prev.client.y;
        targetObj.timeStamp = new Date().getTime() - prev.timeStamp;

        // set pointer velocity
        var dt = Math.max(targetObj.timeStamp / 1000, 0.001);
        targetObj.page.speed   = hypot(targetObj.page.x, targetObj.page.y) / dt;
        targetObj.page.vx      = targetObj.page.x / dt;
        targetObj.page.vy      = targetObj.page.y / dt;

        targetObj.client.speed = hypot(targetObj.client.x, targetObj.page.y) / dt;
        targetObj.client.vx    = targetObj.client.x / dt;
        targetObj.client.vy    = targetObj.client.y / dt;
    }

    // Get specified X/Y coords for mouse or event.touches[0]
    function getXY (type, pointer, xy) {
        xy = xy || {};
        type = type || 'page';

        xy.x = pointer[type + 'X'];
        xy.y = pointer[type + 'Y'];

        return xy;
    }

    function getPageXY (pointer, page, interaction) {
        page = page || {};

        if (pointer instanceof InteractEvent) {
            if (/inertiastart/.test(pointer.type)) {
                interaction = interaction || pointer.interaction;

                extend(page, interaction.inertiaStatus.upCoords.page);

                page.x += interaction.inertiaStatus.sx;
                page.y += interaction.inertiaStatus.sy;
            }
            else {
                page.x = pointer.pageX;
                page.y = pointer.pageY;
            }
        }
        // Opera Mobile handles the viewport and scrolling oddly
        else if (isOperaMobile) {
            getXY('screen', pointer, page);

            page.x += window.scrollX;
            page.y += window.scrollY;
        }
        else {
            getXY('page', pointer, page);
        }

        return page;
    }

    function getClientXY (pointer, client, interaction) {
        client = client || {};

        if (pointer instanceof InteractEvent) {
            if (/inertiastart/.test(pointer.type)) {
                extend(client, interaction.inertiaStatus.upCoords.client);

                client.x += interaction.inertiaStatus.sx;
                client.y += interaction.inertiaStatus.sy;
            }
            else {
                client.x = pointer.clientX;
                client.y = pointer.clientY;
            }
        }
        else {
            // Opera Mobile handles the viewport and scrolling oddly
            getXY(isOperaMobile? 'screen': 'client', pointer, client);
        }

        return client;
    }

    function getScrollXY (win) {
        win = win || window;
        return {
            x: win.scrollX || win.document.documentElement.scrollLeft,
            y: win.scrollY || win.document.documentElement.scrollTop
        };
    }

    function getPointerId (pointer) {
        return isNumber(pointer.pointerId)? pointer.pointerId : pointer.identifier;
    }

    function getActualElement (element) {
        return (element instanceof SVGElementInstance
            ? element.correspondingUseElement
            : element);
    }

    function getWindow (node) {
        if (isWindow(node)) {
            return node;
        }

        var rootNode = (node.ownerDocument || node);

        return rootNode.defaultView || rootNode.parentWindow || window;
    }

    function getElementRect (element) {
        var scroll = isIOS7orLower
                ? { x: 0, y: 0 }
                : getScrollXY(getWindow(element)),
            clientRect = (element instanceof SVGElement)?
                element.getBoundingClientRect():
                element.getClientRects()[0];

        return clientRect && {
            left  : clientRect.left   + scroll.x,
            right : clientRect.right  + scroll.x,
            top   : clientRect.top    + scroll.y,
            bottom: clientRect.bottom + scroll.y,
            width : clientRect.width || clientRect.right - clientRect.left,
            height: clientRect.heigh || clientRect.bottom - clientRect.top
        };
    }

    function getTouchPair (event) {
        var touches = [];

        // array of touches is supplied
        if (isArray(event)) {
            touches[0] = event[0];
            touches[1] = event[1];
        }
        // an event
        else {
            if (event.type === 'touchend') {
                if (event.touches.length === 1) {
                    touches[0] = event.touches[0];
                    touches[1] = event.changedTouches[0];
                }
                else if (event.touches.length === 0) {
                    touches[0] = event.changedTouches[0];
                    touches[1] = event.changedTouches[1];
                }
            }
            else {
                touches[0] = event.touches[0];
                touches[1] = event.touches[1];
            }
        }

        return touches;
    }

    function touchAverage (event) {
        var touches = getTouchPair(event);

        return {
            pageX: (touches[0].pageX + touches[1].pageX) / 2,
            pageY: (touches[0].pageY + touches[1].pageY) / 2,
            clientX: (touches[0].clientX + touches[1].clientX) / 2,
            clientY: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    function touchBBox (event) {
        if (!event.length && !(event.touches && event.touches.length > 1)) {
            return;
        }

        var touches = getTouchPair(event),
            minX = Math.min(touches[0].pageX, touches[1].pageX),
            minY = Math.min(touches[0].pageY, touches[1].pageY),
            maxX = Math.max(touches[0].pageX, touches[1].pageX),
            maxY = Math.max(touches[0].pageY, touches[1].pageY);

        return {
            x: minX,
            y: minY,
            left: minX,
            top: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    }

    function touchDistance (event, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event);


        var dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY];

        return hypot(dx, dy);
    }

    function touchAngle (event, prevAngle, deltaSource) {
        deltaSource = deltaSource || defaultOptions.deltaSource;

        var sourceX = deltaSource + 'X',
            sourceY = deltaSource + 'Y',
            touches = getTouchPair(event),
            dx = touches[0][sourceX] - touches[1][sourceX],
            dy = touches[0][sourceY] - touches[1][sourceY],
            angle = 180 * Math.atan(dy / dx) / Math.PI;

        if (isNumber(prevAngle)) {
            var dr = angle - prevAngle,
                drClamped = dr % 360;

            if (drClamped > 315) {
                angle -= 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped > 135) {
                angle -= 180 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -315) {
                angle += 360 + (angle / 360)|0 * 360;
            }
            else if (drClamped < -135) {
                angle += 180 + (angle / 360)|0 * 360;
            }
        }

        return  angle;
    }

    function getOriginXY (interactable, element) {
        var origin = interactable
                ? interactable.options.origin
                : defaultOptions.origin;

        if (origin === 'parent') {
            origin = parentElement(element);
        }
        else if (origin === 'self') {
            origin = interactable.getRect(element);
        }
        else if (trySelector(origin)) {
            origin = closest(element, origin) || { x: 0, y: 0 };
        }

        if (isFunction(origin)) {
            origin = origin(interactable && element);
        }

        if (isElement(origin))  {
            origin = getElementRect(origin);
        }

        origin.x = ('x' in origin)? origin.x : origin.left;
        origin.y = ('y' in origin)? origin.y : origin.top;

        return origin;
    }

    // http://stackoverflow.com/a/5634528/2280888
    function _getQBezierValue(t, p1, p2, p3) {
        var iT = 1 - t;
        return iT * iT * p1 + 2 * iT * t * p2 + t * t * p3;
    }

    function getQuadraticCurvePoint(startX, startY, cpX, cpY, endX, endY, position) {
        return {
            x:  _getQBezierValue(position, startX, cpX, endX),
            y:  _getQBezierValue(position, startY, cpY, endY)
        };
    }

    // http://gizma.com/easing/
    function easeOutQuad (t, b, c, d) {
        t /= d;
        return -c * t*(t-2) + b;
    }

    function nodeContains (parent, child) {
        while (child) {
            if (child === parent) {
                return true;
            }

            child = child.parentNode;
        }

        return false;
    }

    function closest (child, selector) {
        var parent = parentElement(child);

        while (isElement(parent)) {
            if (matchesSelector(parent, selector)) { return parent; }

            parent = parentElement(parent);
        }

        return null;
    }

    function parentElement (node) {
        var parent = node.parentNode;

        if (isDocFrag(parent)) {
            // skip past #shado-root fragments
            while ((parent = parent.host) && isDocFrag(parent)) {}

            return parent;
        }

        return parent;
    }

    function inContext (interactable, element) {
        return interactable._context === element.ownerDocument
                || nodeContains(interactable._context, element);
    }

    function testIgnore (interactable, interactableElement, element) {
        var ignoreFrom = interactable.options.ignoreFrom;

        if (!ignoreFrom || !isElement(element)) { return false; }

        if (isString(ignoreFrom)) {
            return matchesUpTo(element, ignoreFrom, interactableElement);
        }
        else if (isElement(ignoreFrom)) {
            return nodeContains(ignoreFrom, element);
        }

        return false;
    }

    function testAllow (interactable, interactableElement, element) {
        var allowFrom = interactable.options.allowFrom;

        if (!allowFrom) { return true; }

        if (!isElement(element)) { return false; }

        if (isString(allowFrom)) {
            return matchesUpTo(element, allowFrom, interactableElement);
        }
        else if (isElement(allowFrom)) {
            return nodeContains(allowFrom, element);
        }

        return false;
    }

    function checkAxis (axis, interactable) {
        if (!interactable) { return false; }

        var thisAxis = interactable.options.drag.axis;

        return (axis === 'xy' || thisAxis === 'xy' || thisAxis === axis);
    }

    function checkSnap (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return options[action].snap && options[action].snap.enabled;
    }

    function checkRestrict (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].restrict && options[action].restrict.enabled;
    }

    function checkAutoScroll (interactable, action) {
        var options = interactable.options;

        if (/^resize/.test(action)) {
            action = 'resize';
        }

        return  options[action].autoScroll && options[action].autoScroll.enabled;
    }

    function withinInteractionLimit (interactable, element, action) {
        var options = interactable.options,
            maxActions = options[action.name].max,
            maxPerElement = options[action.name].maxPerElement,
            activeInteractions = 0,
            targetCount = 0,
            targetElementCount = 0;

        for (var i = 0, len = interactions.length; i < len; i++) {
            var interaction = interactions[i],
                otherAction = interaction.prepared.name,
                active = interaction.interacting();

            if (!active) { continue; }

            activeInteractions++;

            if (activeInteractions >= maxInteractions) {
                return false;
            }

            if (interaction.target !== interactable) { continue; }

            targetCount += (otherAction === action.name)|0;

            if (targetCount >= maxActions) {
                return false;
            }

            if (interaction.element === element) {
                targetElementCount++;

                if (otherAction !== action.name || targetElementCount >= maxPerElement) {
                    return false;
                }
            }
        }

        return maxInteractions > 0;
    }

    // Test for the element that's "above" all other qualifiers
    function indexOfDeepestElement (elements) {
        var dropzone,
            deepestZone = elements[0],
            index = deepestZone? 0: -1,
            parent,
            deepestZoneParents = [],
            dropzoneParents = [],
            child,
            i,
            n;

        for (i = 1; i < elements.length; i++) {
            dropzone = elements[i];

            // an element might belong to multiple selector dropzones
            if (!dropzone || dropzone === deepestZone) {
                continue;
            }

            if (!deepestZone) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            // check if the deepest or current are document.documentElement or document.rootElement
            // - if the current dropzone is, do nothing and continue
            if (dropzone.parentNode === dropzone.ownerDocument) {
                continue;
            }
            // - if deepest is, update with the current dropzone and continue to next
            else if (deepestZone.parentNode === dropzone.ownerDocument) {
                deepestZone = dropzone;
                index = i;
                continue;
            }

            if (!deepestZoneParents.length) {
                parent = deepestZone;
                while (parent.parentNode && parent.parentNode !== parent.ownerDocument) {
                    deepestZoneParents.unshift(parent);
                    parent = parent.parentNode;
                }
            }

            // if this element is an svg element and the current deepest is
            // an HTMLElement
            if (deepestZone instanceof HTMLElement
                && dropzone instanceof SVGElement
                && !(dropzone instanceof SVGSVGElement)) {

                if (dropzone === deepestZone.parentNode) {
                    continue;
                }

                parent = dropzone.ownerSVGElement;
            }
            else {
                parent = dropzone;
            }

            dropzoneParents = [];

            while (parent.parentNode !== parent.ownerDocument) {
                dropzoneParents.unshift(parent);
                parent = parent.parentNode;
            }

            n = 0;

            // get (position of last common ancestor) + 1
            while (dropzoneParents[n] && dropzoneParents[n] === deepestZoneParents[n]) {
                n++;
            }

            var parents = [
                dropzoneParents[n - 1],
                dropzoneParents[n],
                deepestZoneParents[n]
            ];

            child = parents[0].lastChild;

            while (child) {
                if (child === parents[1]) {
                    deepestZone = dropzone;
                    index = i;
                    deepestZoneParents = [];

                    break;
                }
                else if (child === parents[2]) {
                    break;
                }

                child = child.previousSibling;
            }
        }

        return index;
    }

    function Interaction () {
        this.target          = null; // current interactable being interacted with
        this.element         = null; // the target element of the interactable
        this.dropTarget      = null; // the dropzone a drag target might be dropped into
        this.dropElement     = null; // the element at the time of checking
        this.prevDropTarget  = null; // the dropzone that was recently dragged away from
        this.prevDropElement = null; // the element at the time of checking

        this.prepared        = {     // action that's ready to be fired on next move event
            name : null,
            axis : null,
            edges: null
        };

        this.matches         = [];   // all selectors that are matched by target element
        this.matchElements   = [];   // corresponding elements

        this.inertiaStatus = {
            active       : false,
            smoothEnd    : false,

            startEvent: null,
            upCoords: {},

            xe: 0, ye: 0,
            sx: 0, sy: 0,

            t0: 0,
            vx0: 0, vys: 0,
            duration: 0,

            resumeDx: 0,
            resumeDy: 0,

            lambda_v0: 0,
            one_ve_v0: 0,
            i  : null
        };

        if (isFunction(Function.prototype.bind)) {
            this.boundInertiaFrame = this.inertiaFrame.bind(this);
            this.boundSmoothEndFrame = this.smoothEndFrame.bind(this);
        }
        else {
            var that = this;

            this.boundInertiaFrame = function () { return that.inertiaFrame(); };
            this.boundSmoothEndFrame = function () { return that.smoothEndFrame(); };
        }

        this.activeDrops = {
            dropzones: [],      // the dropzones that are mentioned below
            elements : [],      // elements of dropzones that accept the target draggable
            rects    : []       // the rects of the elements mentioned above
        };

        // keep track of added pointers
        this.pointers    = [];
        this.pointerIds  = [];
        this.downTargets = [];
        this.downTimes   = [];
        this.holdTimers  = [];

        // Previous native pointer move event coordinates
        this.prevCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };
        // current native pointer move event coordinates
        this.curCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Starting InteractEvent pointer coordinates
        this.startCoords = {
            page     : { x: 0, y: 0 },
            client   : { x: 0, y: 0 },
            timeStamp: 0
        };

        // Change in coordinates and time of the pointer
        this.pointerDelta = {
            page     : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            client   : { x: 0, y: 0, vx: 0, vy: 0, speed: 0 },
            timeStamp: 0
        };

        this.downEvent   = null;    // pointerdown/mousedown/touchstart event
        this.downPointer = {};

        this._eventTarget    = null;
        this._curEventTarget = null;

        this.prevEvent = null;      // previous action event
        this.tapTime   = 0;         // time of the most recent tap event
        this.prevTap   = null;

        this.startOffset    = { left: 0, right: 0, top: 0, bottom: 0 };
        this.restrictOffset = { left: 0, right: 0, top: 0, bottom: 0 };
        this.snapOffsets    = [];

        this.gesture = {
            start: { x: 0, y: 0 },

            startDistance: 0,   // distance between two touches of touchStart
            prevDistance : 0,
            distance     : 0,

            scale: 1,           // gesture.distance / gesture.startDistance

            startAngle: 0,      // angle of line joining two touches
            prevAngle : 0       // angle of the previous gesture event
        };

        this.snapStatus = {
            x       : 0, y       : 0,
            dx      : 0, dy      : 0,
            realX   : 0, realY   : 0,
            snappedX: 0, snappedY: 0,
            targets : [],
            locked  : false,
            changed : false
        };

        this.restrictStatus = {
            dx         : 0, dy         : 0,
            restrictedX: 0, restrictedY: 0,
            snap       : null,
            restricted : false,
            changed    : false
        };

        this.restrictStatus.snap = this.snapStatus;

        this.pointerIsDown   = false;
        this.pointerWasMoved = false;
        this.gesturing       = false;
        this.dragging        = false;
        this.resizing        = false;
        this.resizeAxes      = 'xy';

        this.mouse = false;

        interactions.push(this);
    }

    Interaction.prototype = {
        getPageXY  : function (pointer, xy) { return   getPageXY(pointer, xy, this); },
        getClientXY: function (pointer, xy) { return getClientXY(pointer, xy, this); },
        setEventXY : function (target, ptr) { return  setEventXY(target, ptr, this); },

        pointerOver: function (pointer, event, eventTarget) {
            if (this.prepared.name || !this.mouse) { return; }

            var curMatches = [],
                curMatchElements = [],
                prevTargetElement = this.element;

            this.addPointer(pointer);

            if (this.target
                && (testIgnore(this.target, this.element, eventTarget)
                    || !testAllow(this.target, this.element, eventTarget))) {
                // if the eventTarget should be ignored or shouldn't be allowed
                // clear the previous target
                this.target = null;
                this.element = null;
                this.matches = [];
                this.matchElements = [];
            }

            var elementInteractable = interactables.get(eventTarget),
                elementAction = (elementInteractable
                                 && !testIgnore(elementInteractable, eventTarget, eventTarget)
                                 && testAllow(elementInteractable, eventTarget, eventTarget)
                                 && validateAction(
                                     elementInteractable.getAction(pointer, this, eventTarget),
                                     elementInteractable));

            if (elementAction && !withinInteractionLimit(elementInteractable, eventTarget, elementAction)) {
                 elementAction = null;
            }

            function pushCurMatches (interactable, selector) {
                if (interactable
                    && inContext(interactable, eventTarget)
                    && !testIgnore(interactable, eventTarget, eventTarget)
                    && testAllow(interactable, eventTarget, eventTarget)
                    && matchesSelector(eventTarget, selector)) {

                    curMatches.push(interactable);
                    curMatchElements.push(eventTarget);
                }
            }

            if (elementAction) {
                this.target = elementInteractable;
                this.element = eventTarget;
                this.matches = [];
                this.matchElements = [];
            }
            else {
                interactables.forEachSelector(pushCurMatches);

                if (this.validateSelector(pointer, curMatches, curMatchElements)) {
                    this.matches = curMatches;
                    this.matchElements = curMatchElements;

                    this.pointerHover(pointer, event, this.matches, this.matchElements);
                    events.add(eventTarget,
                                        PointerEvent? pEventTypes.move : 'mousemove',
                                        listeners.pointerHover);
                }
                else if (this.target) {
                    if (nodeContains(prevTargetElement, eventTarget)) {
                        this.pointerHover(pointer, event, this.matches, this.matchElements);
                        events.add(this.element,
                                            PointerEvent? pEventTypes.move : 'mousemove',
                                            listeners.pointerHover);
                    }
                    else {
                        this.target = null;
                        this.element = null;
                        this.matches = [];
                        this.matchElements = [];
                    }
                }
            }
        },

        // Check what action would be performed on pointerMove target if a mouse
        // button were pressed and change the cursor accordingly
        pointerHover: function (pointer, event, eventTarget, curEventTarget, matches, matchElements) {
            var target = this.target;

            if (!this.prepared.name && this.mouse) {

                var action;

                // update pointer coords for defaultActionChecker to use
                this.setEventXY(this.curCoords, pointer);

                if (matches) {
                    action = this.validateSelector(pointer, matches, matchElements);
                }
                else if (target) {
                    action = validateAction(target.getAction(this.pointers[0], this, this.element), this.target);
                }

                if (target && target.options.styleCursor) {
                    if (action) {
                        target._doc.documentElement.style.cursor = getActionCursor(action);
                    }
                    else {
                        target._doc.documentElement.style.cursor = '';
                    }
                }
            }
            else if (this.prepared.name) {
                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        pointerOut: function (pointer, event, eventTarget) {
            if (this.prepared.name) { return; }

            // Remove temporary event listeners for selector Interactables
            if (!interactables.get(eventTarget)) {
                events.remove(eventTarget,
                                       PointerEvent? pEventTypes.move : 'mousemove',
                                       listeners.pointerHover);
            }

            if (this.target && this.target.options.styleCursor && !this.interacting()) {
                this.target._doc.documentElement.style.cursor = '';
            }
        },

        selectorDown: function (pointer, event, eventTarget, curEventTarget) {
            var that = this,
                // copy event to be used in timeout for IE8
                eventCopy = events.useAttachEvent? extend({}, event) : event,
                element = eventTarget,
                pointerIndex = this.addPointer(pointer),
                action;

            this.holdTimers[pointerIndex] = setTimeout(function () {
                that.pointerHold(events.useAttachEvent? eventCopy : pointer, eventCopy, eventTarget, curEventTarget);
            }, defaultOptions._holdDuration);

            this.pointerIsDown = true;

            // Check if the down event hits the current inertia target
            if (this.inertiaStatus.active && this.target.selector) {
                // climb up the DOM tree from the event target
                while (isElement(element)) {

                    // if this element is the current inertia target element
                    if (element === this.element
                        // and the prospective action is the same as the ongoing one
                        && validateAction(this.target.getAction(pointer, this, this.element), this.target).name === this.prepared.name) {

                        // stop inertia so that the next move will be a normal one
                        cancelFrame(this.inertiaStatus.i);
                        this.inertiaStatus.active = false;

                        this.collectEventTargets(pointer, event, eventTarget, 'down');
                        return;
                    }
                    element = parentElement(element);
                }
            }

            // do nothing if interacting
            if (this.interacting()) {
                this.collectEventTargets(pointer, event, eventTarget, 'down');
                return;
            }

            function pushMatches (interactable, selector, context) {
                var elements = ie8MatchesSelector
                    ? context.querySelectorAll(selector)
                    : undefined;

                if (inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, elements)) {

                    that.matches.push(interactable);
                    that.matchElements.push(element);
                }
            }

            // update pointer coords for defaultActionChecker to use
            this.setEventXY(this.curCoords, pointer);

            while (isElement(element) && !action) {
                this.matches = [];
                this.matchElements = [];

                interactables.forEachSelector(pushMatches);

                action = this.validateSelector(pointer, this.matches, this.matchElements);
                element = parentElement(element);
            }

            if (action) {
                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.collectEventTargets(pointer, event, eventTarget, 'down');

                return this.pointerDown(pointer, event, eventTarget, curEventTarget, action);
            }
            else {
                // do these now since pointerDown isn't being called from here
                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                this.downEvent = event;
                extend(this.downPointer, pointer);

                copyCoords(this.prevCoords, this.curCoords);
                this.pointerWasMoved = false;
            }

            this.collectEventTargets(pointer, event, eventTarget, 'down');
        },

        // Determine action to be performed on next pointerMove and add appropriate
        // style and event Listeners
        pointerDown: function (pointer, event, eventTarget, curEventTarget, forceAction) {
            if (!forceAction && !this.inertiaStatus.active && this.pointerWasMoved && this.prepared.name) {
                this.checkAndPreventDefault(event, this.target, this.element);

                return;
            }

            this.pointerIsDown = true;

            var pointerIndex = this.addPointer(pointer),
                action;

            // If it is the second touch of a multi-touch gesture, keep the target
            // the same if a target was set by the first touch
            // Otherwise, set the target if there is no action prepared
            if ((this.pointerIds.length < 2 && !this.target) || !this.prepared.name) {

                var interactable = interactables.get(curEventTarget);

                if (interactable
                    && !testIgnore(interactable, curEventTarget, eventTarget)
                    && testAllow(interactable, curEventTarget, eventTarget)
                    && (action = validateAction(forceAction || interactable.getAction(pointer, this, curEventTarget), interactable, eventTarget))
                    && withinInteractionLimit(interactable, curEventTarget, action)) {
                    this.target = interactable;
                    this.element = curEventTarget;
                }
            }

            var target = this.target,
                options = target && target.options;

            if (target && !this.interacting()) {
                action = action || validateAction(forceAction || target.getAction(pointer, this, curEventTarget), target, this.element);

                this.setEventXY(this.startCoords);

                if (!action) { return; }

                if (options.styleCursor) {
                    target._doc.documentElement.style.cursor = getActionCursor(action);
                }

                this.resizeAxes = action.name === 'resize'? action.axis : null;

                if (action === 'gesture' && this.pointerIds.length < 2) {
                    action = null;
                }

                this.prepared.name  = action.name;
                this.prepared.axis  = action.axis;
                this.prepared.edges = action.edges;

                this.snapStatus.snappedX = this.snapStatus.snappedY =
                    this.restrictStatus.restrictedX = this.restrictStatus.restrictedY = NaN;

                this.downTimes[pointerIndex] = new Date().getTime();
                this.downTargets[pointerIndex] = eventTarget;
                this.downEvent = event;
                extend(this.downPointer, pointer);

                this.setEventXY(this.prevCoords);
                this.pointerWasMoved = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
            // if inertia is active try to resume action
            else if (this.inertiaStatus.active
                && curEventTarget === this.element
                && validateAction(target.getAction(pointer, this, this.element), target).name === this.prepared.name) {

                cancelFrame(this.inertiaStatus.i);
                this.inertiaStatus.active = false;

                this.checkAndPreventDefault(event, target, this.element);
            }
        },

        setModifications: function (coords, preEnd) {
            var target         = this.target,
                shouldMove     = true,
                shouldSnap     = checkSnap(target, this.prepared.name)     && (!target.options[this.prepared.name].snap.endOnly     || preEnd),
                shouldRestrict = checkRestrict(target, this.prepared.name) && (!target.options[this.prepared.name].restrict.endOnly || preEnd);

            if (shouldSnap    ) { this.setSnapping   (coords); } else { this.snapStatus    .locked     = false; }
            if (shouldRestrict) { this.setRestriction(coords); } else { this.restrictStatus.restricted = false; }

            if (shouldSnap && this.snapStatus.locked && !this.snapStatus.changed) {
                shouldMove = shouldRestrict && this.restrictStatus.restricted && this.restrictStatus.changed;
            }
            else if (shouldRestrict && this.restrictStatus.restricted && !this.restrictStatus.changed) {
                shouldMove = false;
            }

            return shouldMove;
        },

        setStartOffsets: function (action, interactable, element) {
            var rect = interactable.getRect(element),
                origin = getOriginXY(interactable, element),
                snap = interactable.options[this.prepared.name].snap,
                restrict = interactable.options[this.prepared.name].restrict,
                width, height;

            if (rect) {
                this.startOffset.left = this.startCoords.page.x - rect.left;
                this.startOffset.top  = this.startCoords.page.y - rect.top;

                this.startOffset.right  = rect.right  - this.startCoords.page.x;
                this.startOffset.bottom = rect.bottom - this.startCoords.page.y;

                if ('width' in rect) { width = rect.width; }
                else { width = rect.right - rect.left; }
                if ('height' in rect) { height = rect.height; }
                else { height = rect.bottom - rect.top; }
            }
            else {
                this.startOffset.left = this.startOffset.top = this.startOffset.right = this.startOffset.bottom = 0;
            }

            this.snapOffsets.splice(0);

            var snapOffset = snap && snap.offset === 'startCoords'
                                ? {
                                    x: this.startCoords.page.x - origin.x,
                                    y: this.startCoords.page.y - origin.y
                                }
                                : snap && snap.offset || { x: 0, y: 0 };

            if (rect && snap && snap.relativePoints && snap.relativePoints.length) {
                for (var i = 0; i < snap.relativePoints.length; i++) {
                    this.snapOffsets.push({
                        x: this.startOffset.left - (width  * snap.relativePoints[i].x) + snapOffset.x,
                        y: this.startOffset.top  - (height * snap.relativePoints[i].y) + snapOffset.y
                    });
                }
            }
            else {
                this.snapOffsets.push(snapOffset);
            }

            if (rect && restrict.elementRect) {
                this.restrictOffset.left = this.startOffset.left - (width  * restrict.elementRect.left);
                this.restrictOffset.top  = this.startOffset.top  - (height * restrict.elementRect.top);

                this.restrictOffset.right  = this.startOffset.right  - (width  * (1 - restrict.elementRect.right));
                this.restrictOffset.bottom = this.startOffset.bottom - (height * (1 - restrict.elementRect.bottom));
            }
            else {
                this.restrictOffset.left = this.restrictOffset.top = this.restrictOffset.right = this.restrictOffset.bottom = 0;
            }
        },

        /*\
         * Interaction.start
         [ method ]
         *
         * Start an action with the given Interactable and Element as tartgets. The
         * action must be enabled for the target Interactable and an appropriate number
         * of pointers must be held down – 1 for drag/resize, 2 for gesture.
         *
         * Use it with `interactable.<action>able({ manualStart: false })` to always
         * [start actions manually](https://github.com/taye/interact.js/issues/114)
         *
         - action       (object)  The action to be performed - drag, resize, etc.
         - interactable (Interactable) The Interactable to target
         - element      (Element) The DOM Element to target
         = (object) interact
         **
         | interact(target)
         |   .draggable({
         |     // disable the default drag start by down->move
         |     manualStart: true
         |   })
         |   // start dragging after the user holds the pointer down
         |   .on('hold', function (event) {
         |     var interaction = event.interaction;
         |
         |     if (!interaction.interacting()) {
         |       interaction.start({ name: 'drag' },
         |                         event.interactable,
         |                         event.currentTarget);
         |     }
         | });
        \*/
        start: function (action, interactable, element) {
            if (this.interacting()
                || !this.pointerIsDown
                || this.pointerIds.length < (action.name === 'gesture'? 2 : 1)) {
                return;
            }

            // if this interaction had been removed after stopping
            // add it back
            if (indexOf(interactions, this) === -1) {
                interactions.push(this);
            }

            this.prepared.name  = action.name;
            this.prepared.axis  = action.axis;
            this.prepared.edges = action.edges;
            this.target         = interactable;
            this.element        = element;

            this.setStartOffsets(action.name, interactable, element);
            this.setModifications(this.startCoords.page);

            this.prevEvent = this[this.prepared.name + 'Start'](this.downEvent);
        },

        pointerMove: function (pointer, event, eventTarget, curEventTarget, preEnd) {
            this.recordPointer(pointer);

            this.setEventXY(this.curCoords, (pointer instanceof InteractEvent)
                                                ? this.inertiaStatus.startEvent
                                                : undefined);

            var duplicateMove = (this.curCoords.page.x === this.prevCoords.page.x
                                 && this.curCoords.page.y === this.prevCoords.page.y
                                 && this.curCoords.client.x === this.prevCoords.client.x
                                 && this.curCoords.client.y === this.prevCoords.client.y);

            var dx, dy,
                pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // register movement greater than pointerMoveTolerance
            if (this.pointerIsDown && !this.pointerWasMoved) {
                dx = this.curCoords.client.x - this.startCoords.client.x;
                dy = this.curCoords.client.y - this.startCoords.client.y;

                this.pointerWasMoved = hypot(dx, dy) > pointerMoveTolerance;
            }

            if (!duplicateMove && (!this.pointerIsDown || this.pointerWasMoved)) {
                if (this.pointerIsDown) {
                    clearTimeout(this.holdTimers[pointerIndex]);
                }

                this.collectEventTargets(pointer, event, eventTarget, 'move');
            }

            if (!this.pointerIsDown) { return; }

            if (duplicateMove && this.pointerWasMoved && !preEnd) {
                this.checkAndPreventDefault(event, this.target, this.element);
                return;
            }

            // set pointer coordinate, time changes and speeds
            setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

            if (!this.prepared.name) { return; }

            if (this.pointerWasMoved
                // ignore movement while inertia is active
                && (!this.inertiaStatus.active || (pointer instanceof InteractEvent && /inertiastart/.test(pointer.type)))) {

                // if just starting an action, calculate the pointer speed now
                if (!this.interacting()) {
                    setEventDeltas(this.pointerDelta, this.prevCoords, this.curCoords);

                    // check if a drag is in the correct axis
                    if (this.prepared.name === 'drag') {
                        var absX = Math.abs(dx),
                            absY = Math.abs(dy),
                            targetAxis = this.target.options.drag.axis,
                            axis = (absX > absY ? 'x' : absX < absY ? 'y' : 'xy');

                        // if the movement isn't in the axis of the interactable
                        if (axis !== 'xy' && targetAxis !== 'xy' && targetAxis !== axis) {
                            // cancel the prepared action
                            this.prepared.name = null;

                            // then try to get a drag from another ineractable

                            var element = eventTarget;

                            // check element interactables
                            while (isElement(element)) {
                                var elementInteractable = interactables.get(element);

                                if (elementInteractable
                                    && elementInteractable !== this.target
                                    && !elementInteractable.options.drag.manualStart
                                    && elementInteractable.getAction(this.downPointer, this, element).name === 'drag'
                                    && checkAxis(axis, elementInteractable)) {

                                    this.prepared.name = 'drag';
                                    this.target = elementInteractable;
                                    this.element = element;
                                    break;
                                }

                                element = parentElement(element);
                            }

                            // if there's no drag from element interactables,
                            // check the selector interactables
                            if (!this.prepared.name) {
                                var getDraggable = function (interactable, selector, context) {
                                    var elements = ie8MatchesSelector
                                        ? context.querySelectorAll(selector)
                                        : undefined;

                                    if (interactable === this.target) { return; }

                                    if (inContext(interactable, eventTarget)
                                        && !interactable.options.drag.manualStart
                                        && !testIgnore(interactable, element, eventTarget)
                                        && testAllow(interactable, element, eventTarget)
                                        && matchesSelector(element, selector, elements)
                                        && interactable.getAction(this.downPointer, this, element).name === 'drag'
                                        && checkAxis(axis, interactable)
                                        && withinInteractionLimit(interactable, element, 'drag')) {

                                        return interactable;
                                    }
                                };

                                element = eventTarget;

                                while (isElement(element)) {
                                    var selectorInteractable = interactables.forEachSelector(getDraggable);

                                    if (selectorInteractable) {
                                        this.prepared.name = 'drag';
                                        this.target = selectorInteractable;
                                        this.element = element;
                                        break;
                                    }

                                    element = parentElement(element);
                                }
                            }
                        }
                    }
                }

                var starting = !!this.prepared.name && !this.interacting();

                if (starting
                    && (this.target.options[this.prepared.name].manualStart
                        || !withinInteractionLimit(this.target, this.element, this.prepared))) {
                    this.stop();
                    return;
                }

                if (this.prepared.name && this.target) {
                    if (starting) {
                        this.start(this.prepared, this.target, this.element);
                    }

                    var shouldMove = this.setModifications(this.curCoords.page, preEnd);

                    // move if snapping or restriction doesn't prevent it
                    if (shouldMove || starting) {
                        this.prevEvent = this[this.prepared.name + 'Move'](event);
                    }

                    this.checkAndPreventDefault(event, this.target, this.element);
                }
            }

            copyCoords(this.prevCoords, this.curCoords);

            if (this.dragging || this.resizing) {
                autoScroll.edgeMove(event);
            }
        },

        dragStart: function (event) {
            var dragEvent = new InteractEvent(this, event, 'drag', 'start', this.element);

            this.dragging = true;
            this.target.fire(dragEvent);

            // reset active dropzones
            this.activeDrops.dropzones = [];
            this.activeDrops.elements  = [];
            this.activeDrops.rects     = [];

            if (!this.dynamicDrop) {
                this.setActiveDrops(this.element);
            }

            var dropEvents = this.getDropEvents(event, dragEvent);

            if (dropEvents.activate) {
                this.fireActiveDrops(dropEvents.activate);
            }

            return dragEvent;
        },

        dragMove: function (event) {
            var target = this.target,
                dragEvent  = new InteractEvent(this, event, 'drag', 'move', this.element),
                draggableElement = this.element,
                drop = this.getDrop(dragEvent, draggableElement);

            this.dropTarget = drop.dropzone;
            this.dropElement = drop.element;

            var dropEvents = this.getDropEvents(event, dragEvent);

            target.fire(dragEvent);

            if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
            if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
            if (dropEvents.move ) {     this.dropTarget.fire(dropEvents.move ); }

            this.prevDropTarget  = this.dropTarget;
            this.prevDropElement = this.dropElement;

            return dragEvent;
        },

        resizeStart: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'start', this.element);

            if (this.prepared.edges) {
                var startRect = this.target.getRect(this.element);

                if (this.target.options.resize.square) {
                    var squareEdges = extend({}, this.prepared.edges);

                    squareEdges.top    = squareEdges.top    || (squareEdges.left   && !squareEdges.bottom);
                    squareEdges.left   = squareEdges.left   || (squareEdges.top    && !squareEdges.right );
                    squareEdges.bottom = squareEdges.bottom || (squareEdges.right  && !squareEdges.top   );
                    squareEdges.right  = squareEdges.right  || (squareEdges.bottom && !squareEdges.left  );

                    this.prepared._squareEdges = squareEdges;
                }
                else {
                    this.prepared._squareEdges = null;
                }

                this.resizeRects = {
                    start     : startRect,
                    current   : extend({}, startRect),
                    restricted: extend({}, startRect),
                    previous  : extend({}, startRect),
                    delta     : {
                        left: 0, right : 0, width : 0,
                        top : 0, bottom: 0, height: 0
                    }
                };

                resizeEvent.rect = this.resizeRects.restricted;
                resizeEvent.deltaRect = this.resizeRects.delta;
            }

            this.target.fire(resizeEvent);

            this.resizing = true;

            return resizeEvent;
        },

        resizeMove: function (event) {
            var resizeEvent = new InteractEvent(this, event, 'resize', 'move', this.element);

            var edges = this.prepared.edges,
                invert = this.target.options.resize.invert,
                invertible = invert === 'reposition' || invert === 'negate';

            if (edges) {
                var dx = resizeEvent.dx,
                    dy = resizeEvent.dy,

                    start      = this.resizeRects.start,
                    current    = this.resizeRects.current,
                    restricted = this.resizeRects.restricted,
                    delta      = this.resizeRects.delta,
                    previous   = extend(this.resizeRects.previous, restricted);

                if (this.target.options.resize.square) {
                    var originalEdges = edges;

                    edges = this.prepared._squareEdges;

                    if ((originalEdges.left && originalEdges.bottom)
                        || (originalEdges.right && originalEdges.top)) {
                        dy = -dx;
                    }
                    else if (originalEdges.left || originalEdges.right) { dy = dx; }
                    else if (originalEdges.top || originalEdges.bottom) { dx = dy; }
                }

                // update the 'current' rect without modifications
                if (edges.top   ) { current.top    += dy; }
                if (edges.bottom) { current.bottom += dy; }
                if (edges.left  ) { current.left   += dx; }
                if (edges.right ) { current.right  += dx; }

                if (invertible) {
                    // if invertible, copy the current rect
                    extend(restricted, current);

                    if (invert === 'reposition') {
                        // swap edge values if necessary to keep width/height positive
                        var swap;

                        if (restricted.top > restricted.bottom) {
                            swap = restricted.top;

                            restricted.top = restricted.bottom;
                            restricted.bottom = swap;
                        }
                        if (restricted.left > restricted.right) {
                            swap = restricted.left;

                            restricted.left = restricted.right;
                            restricted.right = swap;
                        }
                    }
                }
                else {
                    // if not invertible, restrict to minimum of 0x0 rect
                    restricted.top    = Math.min(current.top, start.bottom);
                    restricted.bottom = Math.max(current.bottom, start.top);
                    restricted.left   = Math.min(current.left, start.right);
                    restricted.right  = Math.max(current.right, start.left);
                }

                restricted.width  = restricted.right  - restricted.left;
                restricted.height = restricted.bottom - restricted.top ;

                for (var edge in restricted) {
                    delta[edge] = restricted[edge] - previous[edge];
                }

                resizeEvent.edges = this.prepared.edges;
                resizeEvent.rect = restricted;
                resizeEvent.deltaRect = delta;
            }

            this.target.fire(resizeEvent);

            return resizeEvent;
        },

        gestureStart: function (event) {
            var gestureEvent = new InteractEvent(this, event, 'gesture', 'start', this.element);

            gestureEvent.ds = 0;

            this.gesture.startDistance = this.gesture.prevDistance = gestureEvent.distance;
            this.gesture.startAngle = this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.scale = 1;

            this.gesturing = true;

            this.target.fire(gestureEvent);

            return gestureEvent;
        },

        gestureMove: function (event) {
            if (!this.pointerIds.length) {
                return this.prevEvent;
            }

            var gestureEvent;

            gestureEvent = new InteractEvent(this, event, 'gesture', 'move', this.element);
            gestureEvent.ds = gestureEvent.scale - this.gesture.scale;

            this.target.fire(gestureEvent);

            this.gesture.prevAngle = gestureEvent.angle;
            this.gesture.prevDistance = gestureEvent.distance;

            if (gestureEvent.scale !== Infinity &&
                gestureEvent.scale !== null &&
                gestureEvent.scale !== undefined  &&
                !isNaN(gestureEvent.scale)) {

                this.gesture.scale = gestureEvent.scale;
            }

            return gestureEvent;
        },

        pointerHold: function (pointer, event, eventTarget) {
            this.collectEventTargets(pointer, event, eventTarget, 'hold');
        },

        pointerUp: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'up' );
            this.collectEventTargets(pointer, event, eventTarget, 'tap');

            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        pointerCancel: function (pointer, event, eventTarget, curEventTarget) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            clearTimeout(this.holdTimers[pointerIndex]);

            this.collectEventTargets(pointer, event, eventTarget, 'cancel');
            this.pointerEnd(pointer, event, eventTarget, curEventTarget);

            this.removePointer(pointer);
        },

        // http://www.quirksmode.org/dom/events/click.html
        // >Events leading to dblclick
        //
        // IE8 doesn't fire down event before dblclick.
        // This workaround tries to fire a tap and doubletap after dblclick
        ie8Dblclick: function (pointer, event, eventTarget) {
            if (this.prevTap
                && event.clientX === this.prevTap.clientX
                && event.clientY === this.prevTap.clientY
                && eventTarget   === this.prevTap.target) {

                this.downTargets[0] = eventTarget;
                this.downTimes[0] = new Date().getTime();
                this.collectEventTargets(pointer, event, eventTarget, 'tap');
            }
        },

        // End interact move events and stop auto-scroll unless inertia is enabled
        pointerEnd: function (pointer, event, eventTarget, curEventTarget) {
            var endEvent,
                target = this.target,
                options = target && target.options,
                inertiaOptions = options && this.prepared.name && options[this.prepared.name].inertia,
                inertiaStatus = this.inertiaStatus;

            if (this.interacting()) {

                if (inertiaStatus.active) { return; }

                var pointerSpeed,
                    now = new Date().getTime(),
                    inertiaPossible = false,
                    inertia = false,
                    smoothEnd = false,
                    endSnap = checkSnap(target, this.prepared.name) && options[this.prepared.name].snap.endOnly,
                    endRestrict = checkRestrict(target, this.prepared.name) && options[this.prepared.name].restrict.endOnly,
                    dx = 0,
                    dy = 0,
                    startEvent;

                if (this.dragging) {
                    if      (options.drag.axis === 'x' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vx); }
                    else if (options.drag.axis === 'y' ) { pointerSpeed = Math.abs(this.pointerDelta.client.vy); }
                    else   /*options.drag.axis === 'xy'*/{ pointerSpeed = this.pointerDelta.client.speed; }
                }
                else {
                    pointerSpeed = this.pointerDelta.client.speed;
                }

                // check if inertia should be started
                inertiaPossible = (inertiaOptions && inertiaOptions.enabled
                                   && this.prepared.name !== 'gesture'
                                   && event !== inertiaStatus.startEvent);

                inertia = (inertiaPossible
                           && (now - this.curCoords.timeStamp) < 50
                           && pointerSpeed > inertiaOptions.minSpeed
                           && pointerSpeed > inertiaOptions.endSpeed);

                if (inertiaPossible && !inertia && (endSnap || endRestrict)) {

                    var snapRestrict = {};

                    snapRestrict.snap = snapRestrict.restrict = snapRestrict;

                    if (endSnap) {
                        this.setSnapping(this.curCoords.page, snapRestrict);
                        if (snapRestrict.locked) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (endRestrict) {
                        this.setRestriction(this.curCoords.page, snapRestrict);
                        if (snapRestrict.restricted) {
                            dx += snapRestrict.dx;
                            dy += snapRestrict.dy;
                        }
                    }

                    if (dx || dy) {
                        smoothEnd = true;
                    }
                }

                if (inertia || smoothEnd) {
                    copyCoords(inertiaStatus.upCoords, this.curCoords);

                    this.pointers[0] = inertiaStatus.startEvent = startEvent =
                        new InteractEvent(this, event, this.prepared.name, 'inertiastart', this.element);

                    inertiaStatus.t0 = now;

                    target.fire(inertiaStatus.startEvent);

                    if (inertia) {
                        inertiaStatus.vx0 = this.pointerDelta.client.vx;
                        inertiaStatus.vy0 = this.pointerDelta.client.vy;
                        inertiaStatus.v0 = pointerSpeed;

                        this.calcInertia(inertiaStatus);

                        var page = extend({}, this.curCoords.page),
                            origin = getOriginXY(target, this.element),
                            statusObject;

                        page.x = page.x + inertiaStatus.xe - origin.x;
                        page.y = page.y + inertiaStatus.ye - origin.y;

                        statusObject = {
                            useStatusXY: true,
                            x: page.x,
                            y: page.y,
                            dx: 0,
                            dy: 0,
                            snap: null
                        };

                        statusObject.snap = statusObject;

                        dx = dy = 0;

                        if (endSnap) {
                            var snap = this.setSnapping(this.curCoords.page, statusObject);

                            if (snap.locked) {
                                dx += snap.dx;
                                dy += snap.dy;
                            }
                        }

                        if (endRestrict) {
                            var restrict = this.setRestriction(this.curCoords.page, statusObject);

                            if (restrict.restricted) {
                                dx += restrict.dx;
                                dy += restrict.dy;
                            }
                        }

                        inertiaStatus.modifiedXe += dx;
                        inertiaStatus.modifiedYe += dy;

                        inertiaStatus.i = reqFrame(this.boundInertiaFrame);
                    }
                    else {
                        inertiaStatus.smoothEnd = true;
                        inertiaStatus.xe = dx;
                        inertiaStatus.ye = dy;

                        inertiaStatus.sx = inertiaStatus.sy = 0;

                        inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
                    }

                    inertiaStatus.active = true;
                    return;
                }

                if (endSnap || endRestrict) {
                    // fire a move event at the snapped coordinates
                    this.pointerMove(pointer, event, eventTarget, curEventTarget, true);
                }
            }

            if (this.dragging) {
                endEvent = new InteractEvent(this, event, 'drag', 'end', this.element);

                var draggableElement = this.element,
                    drop = this.getDrop(endEvent, draggableElement);

                this.dropTarget = drop.dropzone;
                this.dropElement = drop.element;

                var dropEvents = this.getDropEvents(event, endEvent);

                if (dropEvents.leave) { this.prevDropTarget.fire(dropEvents.leave); }
                if (dropEvents.enter) {     this.dropTarget.fire(dropEvents.enter); }
                if (dropEvents.drop ) {     this.dropTarget.fire(dropEvents.drop ); }
                if (dropEvents.deactivate) {
                    this.fireActiveDrops(dropEvents.deactivate);
                }

                target.fire(endEvent);
            }
            else if (this.resizing) {
                endEvent = new InteractEvent(this, event, 'resize', 'end', this.element);
                target.fire(endEvent);
            }
            else if (this.gesturing) {
                endEvent = new InteractEvent(this, event, 'gesture', 'end', this.element);
                target.fire(endEvent);
            }

            this.stop(event);
        },

        collectDrops: function (element) {
            var drops = [],
                elements = [],
                i;

            element = element || this.element;

            // collect all dropzones and their elements which qualify for a drop
            for (i = 0; i < interactables.length; i++) {
                if (!interactables[i].options.drop.enabled) { continue; }

                var current = interactables[i],
                    accept = current.options.drop.accept;

                // test the draggable element against the dropzone's accept setting
                if ((isElement(accept) && accept !== element)
                    || (isString(accept)
                        && !matchesSelector(element, accept))) {

                    continue;
                }

                // query for new elements if necessary
                var dropElements = current.selector? current._context.querySelectorAll(current.selector) : [current._element];

                for (var j = 0, len = dropElements.length; j < len; j++) {
                    var currentElement = dropElements[j];

                    if (currentElement === element) {
                        continue;
                    }

                    drops.push(current);
                    elements.push(currentElement);
                }
            }

            return {
                dropzones: drops,
                elements: elements
            };
        },

        fireActiveDrops: function (event) {
            var i,
                current,
                currentElement,
                prevElement;

            // loop through all active dropzones and trigger event
            for (i = 0; i < this.activeDrops.dropzones.length; i++) {
                current = this.activeDrops.dropzones[i];
                currentElement = this.activeDrops.elements [i];

                // prevent trigger of duplicate events on same element
                if (currentElement !== prevElement) {
                    // set current element as event target
                    event.target = currentElement;
                    current.fire(event);
                }
                prevElement = currentElement;
            }
        },

        // Collect a new set of possible drops and save them in activeDrops.
        // setActiveDrops should always be called when a drag has just started or a
        // drag event happens while dynamicDrop is true
        setActiveDrops: function (dragElement) {
            // get dropzones and their elements that could receive the draggable
            var possibleDrops = this.collectDrops(dragElement, true);

            this.activeDrops.dropzones = possibleDrops.dropzones;
            this.activeDrops.elements  = possibleDrops.elements;
            this.activeDrops.rects     = [];

            for (var i = 0; i < this.activeDrops.dropzones.length; i++) {
                this.activeDrops.rects[i] = this.activeDrops.dropzones[i].getRect(this.activeDrops.elements[i]);
            }
        },

        getDrop: function (event, dragElement) {
            var validDrops = [];

            if (dynamicDrop) {
                this.setActiveDrops(dragElement);
            }

            // collect all dropzones and their elements which qualify for a drop
            for (var j = 0; j < this.activeDrops.dropzones.length; j++) {
                var current        = this.activeDrops.dropzones[j],
                    currentElement = this.activeDrops.elements [j],
                    rect           = this.activeDrops.rects    [j];

                validDrops.push(current.dropCheck(this.pointers[0], this.target, dragElement, currentElement, rect)
                                ? currentElement
                                : null);
            }

            // get the most appropriate dropzone based on DOM depth and order
            var dropIndex = indexOfDeepestElement(validDrops),
                dropzone  = this.activeDrops.dropzones[dropIndex] || null,
                element   = this.activeDrops.elements [dropIndex] || null;

            return {
                dropzone: dropzone,
                element: element
            };
        },

        getDropEvents: function (pointerEvent, dragEvent) {
            var dropEvents = {
                enter     : null,
                leave     : null,
                activate  : null,
                deactivate: null,
                move      : null,
                drop      : null
            };

            if (this.dropElement !== this.prevDropElement) {
                // if there was a prevDropTarget, create a dragleave event
                if (this.prevDropTarget) {
                    dropEvents.leave = {
                        target       : this.prevDropElement,
                        dropzone     : this.prevDropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragleave'
                    };

                    dragEvent.dragLeave = this.prevDropElement;
                    dragEvent.prevDropzone = this.prevDropTarget;
                }
                // if the dropTarget is not null, create a dragenter event
                if (this.dropTarget) {
                    dropEvents.enter = {
                        target       : this.dropElement,
                        dropzone     : this.dropTarget,
                        relatedTarget: dragEvent.target,
                        draggable    : dragEvent.interactable,
                        dragEvent    : dragEvent,
                        interaction  : this,
                        timeStamp    : dragEvent.timeStamp,
                        type         : 'dragenter'
                    };

                    dragEvent.dragEnter = this.dropElement;
                    dragEvent.dropzone = this.dropTarget;
                }
            }

            if (dragEvent.type === 'dragend' && this.dropTarget) {
                dropEvents.drop = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'drop'
                };
            }
            if (dragEvent.type === 'dragstart') {
                dropEvents.activate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropactivate'
                };
            }
            if (dragEvent.type === 'dragend') {
                dropEvents.deactivate = {
                    target       : null,
                    dropzone     : null,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropdeactivate'
                };
            }
            if (dragEvent.type === 'dragmove' && this.dropTarget) {
                dropEvents.move = {
                    target       : this.dropElement,
                    dropzone     : this.dropTarget,
                    relatedTarget: dragEvent.target,
                    draggable    : dragEvent.interactable,
                    dragEvent    : dragEvent,
                    interaction  : this,
                    dragmove     : dragEvent,
                    timeStamp    : dragEvent.timeStamp,
                    type         : 'dropmove'
                };
                dragEvent.dropzone = this.dropTarget;
            }

            return dropEvents;
        },

        currentAction: function () {
            return (this.dragging && 'drag') || (this.resizing && 'resize') || (this.gesturing && 'gesture') || null;
        },

        interacting: function () {
            return this.dragging || this.resizing || this.gesturing;
        },

        clearTargets: function () {
            if (this.target && !this.target.selector) {
                this.target = this.element = null;
            }

            this.dropTarget = this.dropElement = this.prevDropTarget = this.prevDropElement = null;
        },

        stop: function (event) {
            if (this.interacting()) {
                autoScroll.stop();
                this.matches = [];
                this.matchElements = [];

                var target = this.target;

                if (target.options.styleCursor) {
                    target._doc.documentElement.style.cursor = '';
                }

                // prevent Default only if were previously interacting
                if (event && isFunction(event.preventDefault)) {
                    this.checkAndPreventDefault(event, target, this.element);
                }

                if (this.dragging) {
                    this.activeDrops.dropzones = this.activeDrops.elements = this.activeDrops.rects = null;
                }

                this.clearTargets();
            }

            this.pointerIsDown = this.snapStatus.locked = this.dragging = this.resizing = this.gesturing = false;
            this.prepared.name = this.prevEvent = null;
            this.inertiaStatus.resumeDx = this.inertiaStatus.resumeDy = 0;

            // remove pointers if their ID isn't in this.pointerIds
            for (var i = 0; i < this.pointers.length; i++) {
                if (indexOf(this.pointerIds, getPointerId(this.pointers[i])) === -1) {
                    this.pointers.splice(i, 1);
                }
            }

            // delete interaction if it's not the only one
            if (interactions.length > 1) {
                interactions.splice(indexOf(interactions, this), 1);
            }
        },

        inertiaFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                options = this.target.options[this.prepared.name].inertia,
                lambda = options.resistance,
                t = new Date().getTime() / 1000 - inertiaStatus.t0;

            if (t < inertiaStatus.te) {

                var progress =  1 - (Math.exp(-lambda * t) - inertiaStatus.lambda_v0) / inertiaStatus.one_ve_v0;

                if (inertiaStatus.modifiedXe === inertiaStatus.xe && inertiaStatus.modifiedYe === inertiaStatus.ye) {
                    inertiaStatus.sx = inertiaStatus.xe * progress;
                    inertiaStatus.sy = inertiaStatus.ye * progress;
                }
                else {
                    var quadPoint = getQuadraticCurvePoint(
                            0, 0,
                            inertiaStatus.xe, inertiaStatus.ye,
                            inertiaStatus.modifiedXe, inertiaStatus.modifiedYe,
                            progress);

                    inertiaStatus.sx = quadPoint.x;
                    inertiaStatus.sy = quadPoint.y;
                }

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundInertiaFrame);
            }
            else {
                inertiaStatus.sx = inertiaStatus.modifiedXe;
                inertiaStatus.sy = inertiaStatus.modifiedYe;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.active = false;
                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);
            }
        },

        smoothEndFrame: function () {
            var inertiaStatus = this.inertiaStatus,
                t = new Date().getTime() - inertiaStatus.t0,
                duration = this.target.options[this.prepared.name].inertia.smoothEndDuration;

            if (t < duration) {
                inertiaStatus.sx = easeOutQuad(t, 0, inertiaStatus.xe, duration);
                inertiaStatus.sy = easeOutQuad(t, 0, inertiaStatus.ye, duration);

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.i = reqFrame(this.boundSmoothEndFrame);
            }
            else {
                inertiaStatus.sx = inertiaStatus.xe;
                inertiaStatus.sy = inertiaStatus.ye;

                this.pointerMove(inertiaStatus.startEvent, inertiaStatus.startEvent);

                inertiaStatus.active = false;
                inertiaStatus.smoothEnd = false;

                this.pointerEnd(inertiaStatus.startEvent, inertiaStatus.startEvent);
            }
        },

        addPointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) {
                index = this.pointerIds.length;
            }

            this.pointerIds[index] = id;
            this.pointers[index] = pointer;

            return index;
        },

        removePointer: function (pointer) {
            var id = getPointerId(pointer),
                index = this.mouse? 0 : indexOf(this.pointerIds, id);

            if (index === -1) { return; }

            if (!this.interacting()) {
                this.pointers.splice(index, 1);
            }

            this.pointerIds .splice(index, 1);
            this.downTargets.splice(index, 1);
            this.downTimes  .splice(index, 1);
            this.holdTimers .splice(index, 1);
        },

        recordPointer: function (pointer) {
            // Do not update pointers while inertia is active.
            // The inertia start event should be this.pointers[0]
            if (this.inertiaStatus.active) { return; }

            var index = this.mouse? 0: indexOf(this.pointerIds, getPointerId(pointer));

            if (index === -1) { return; }

            this.pointers[index] = pointer;
        },

        collectEventTargets: function (pointer, event, eventTarget, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(this.pointerIds, getPointerId(pointer));

            // do not fire a tap event if the pointer was moved before being lifted
            if (eventType === 'tap' && (this.pointerWasMoved
                // or if the pointerup target is different to the pointerdown target
                || !(this.downTargets[pointerIndex] && this.downTargets[pointerIndex] === eventTarget))) {
                return;
            }

            var targets = [],
                elements = [],
                element = eventTarget;

            function collectSelectors (interactable, selector, context) {
                var els = ie8MatchesSelector
                        ? context.querySelectorAll(selector)
                        : undefined;

                if (interactable._iEvents[eventType]
                    && isElement(element)
                    && inContext(interactable, element)
                    && !testIgnore(interactable, element, eventTarget)
                    && testAllow(interactable, element, eventTarget)
                    && matchesSelector(element, selector, els)) {

                    targets.push(interactable);
                    elements.push(element);
                }
            }

            while (element) {
                if (interact.isSet(element) && interact(element)._iEvents[eventType]) {
                    targets.push(interact(element));
                    elements.push(element);
                }

                interactables.forEachSelector(collectSelectors);

                element = parentElement(element);
            }

            // create the tap event even if there are no listeners so that
            // doubletap can still be created and fired
            if (targets.length || eventType === 'tap') {
                this.firePointers(pointer, event, eventTarget, targets, elements, eventType);
            }
        },

        firePointers: function (pointer, event, eventTarget, targets, elements, eventType) {
            var pointerIndex = this.mouse? 0 : indexOf(getPointerId(pointer)),
                pointerEvent = {},
                i,
                // for tap events
                interval, createNewDoubleTap;

            // if it's a doubletap then the event properties would have been
            // copied from the tap event and provided as the pointer argument
            if (eventType === 'doubletap') {
                pointerEvent = pointer;
            }
            else {
                extend(pointerEvent, event);
                if (event !== pointer) {
                    extend(pointerEvent, pointer);
                }

                pointerEvent.preventDefault           = preventOriginalDefault;
                pointerEvent.stopPropagation          = InteractEvent.prototype.stopPropagation;
                pointerEvent.stopImmediatePropagation = InteractEvent.prototype.stopImmediatePropagation;
                pointerEvent.interaction              = this;

                pointerEvent.timeStamp     = new Date().getTime();
                pointerEvent.originalEvent = event;
                pointerEvent.type          = eventType;
                pointerEvent.pointerId     = getPointerId(pointer);
                pointerEvent.pointerType   = this.mouse? 'mouse' : !supportsPointerEvent? 'touch'
                                                    : isString(pointer.pointerType)
                                                        ? pointer.pointerType
                                                        : [,,'touch', 'pen', 'mouse'][pointer.pointerType];
            }

            if (eventType === 'tap') {
                pointerEvent.dt = pointerEvent.timeStamp - this.downTimes[pointerIndex];

                interval = pointerEvent.timeStamp - this.tapTime;
                createNewDoubleTap = !!(this.prevTap && this.prevTap.type !== 'doubletap'
                       && this.prevTap.target === pointerEvent.target
                       && interval < 500);

                pointerEvent.double = createNewDoubleTap;

                this.tapTime = pointerEvent.timeStamp;
            }

            for (i = 0; i < targets.length; i++) {
                pointerEvent.currentTarget = elements[i];
                pointerEvent.interactable = targets[i];
                targets[i].fire(pointerEvent);

                if (pointerEvent.immediatePropagationStopped
                    ||(pointerEvent.propagationStopped && elements[i + 1] !== pointerEvent.currentTarget)) {
                    break;
                }
            }

            if (createNewDoubleTap) {
                var doubleTap = {};

                extend(doubleTap, pointerEvent);

                doubleTap.dt   = interval;
                doubleTap.type = 'doubletap';

                this.collectEventTargets(doubleTap, event, eventTarget, 'doubletap');

                this.prevTap = doubleTap;
            }
            else if (eventType === 'tap') {
                this.prevTap = pointerEvent;
            }
        },

        validateSelector: function (pointer, matches, matchElements) {
            for (var i = 0, len = matches.length; i < len; i++) {
                var match = matches[i],
                    matchElement = matchElements[i],
                    action = validateAction(match.getAction(pointer, this, matchElement), match);

                if (action && withinInteractionLimit(match, matchElement, action)) {
                    this.target = match;
                    this.element = matchElement;

                    return action;
                }
            }
        },

        setSnapping: function (pageCoords, status) {
            var snap = this.target.options[this.prepared.name].snap,
                targets = [],
                target,
                page,
                i;

            status = status || this.snapStatus;

            if (status.useStatusXY) {
                page = { x: status.x, y: status.y };
            }
            else {
                var origin = getOriginXY(this.target, this.element);

                page = extend({}, pageCoords);

                page.x -= origin.x;
                page.y -= origin.y;
            }

            status.realX = page.x;
            status.realY = page.y;

            page.x = page.x - this.inertiaStatus.resumeDx;
            page.y = page.y - this.inertiaStatus.resumeDy;

            var len = snap.targets? snap.targets.length : 0;

            for (var relIndex = 0; relIndex < this.snapOffsets.length; relIndex++) {
                var relative = {
                    x: page.x - this.snapOffsets[relIndex].x,
                    y: page.y - this.snapOffsets[relIndex].y
                };

                for (i = 0; i < len; i++) {
                    if (isFunction(snap.targets[i])) {
                        target = snap.targets[i](relative.x, relative.y, this);
                    }
                    else {
                        target = snap.targets[i];
                    }

                    if (!target) { continue; }

                    targets.push({
                        x: isNumber(target.x) ? (target.x + this.snapOffsets[relIndex].x) : relative.x,
                        y: isNumber(target.y) ? (target.y + this.snapOffsets[relIndex].y) : relative.y,

                        range: isNumber(target.range)? target.range: snap.range
                    });
                }
            }

            var closest = {
                    target: null,
                    inRange: false,
                    distance: 0,
                    range: 0,
                    dx: 0,
                    dy: 0
                };

            for (i = 0, len = targets.length; i < len; i++) {
                target = targets[i];

                var range = target.range,
                    dx = target.x - page.x,
                    dy = target.y - page.y,
                    distance = hypot(dx, dy),
                    inRange = distance <= range;

                // Infinite targets count as being out of range
                // compared to non infinite ones that are in range
                if (range === Infinity && closest.inRange && closest.range !== Infinity) {
                    inRange = false;
                }

                if (!closest.target || (inRange
                    // is the closest target in range?
                    ? (closest.inRange && range !== Infinity
                        // the pointer is relatively deeper in this target
                        ? distance / range < closest.distance / closest.range
                        // this target has Infinite range and the closest doesn't
                        : (range === Infinity && closest.range !== Infinity)
                            // OR this target is closer that the previous closest
                            || distance < closest.distance)
                    // The other is not in range and the pointer is closer to this target
                    : (!closest.inRange && distance < closest.distance))) {

                    if (range === Infinity) {
                        inRange = true;
                    }

                    closest.target = target;
                    closest.distance = distance;
                    closest.range = range;
                    closest.inRange = inRange;
                    closest.dx = dx;
                    closest.dy = dy;

                    status.range = range;
                }
            }

            var snapChanged;

            if (closest.target) {
                snapChanged = (status.snappedX !== closest.target.x || status.snappedY !== closest.target.y);

                status.snappedX = closest.target.x;
                status.snappedY = closest.target.y;
            }
            else {
                snapChanged = true;

                status.snappedX = NaN;
                status.snappedY = NaN;
            }

            status.dx = closest.dx;
            status.dy = closest.dy;

            status.changed = (snapChanged || (closest.inRange && !status.locked));
            status.locked = closest.inRange;

            return status;
        },

        setRestriction: function (pageCoords, status) {
            var target = this.target,
                restrict = target && target.options[this.prepared.name].restrict,
                restriction = restrict && restrict.restriction,
                page;

            if (!restriction) {
                return status;
            }

            status = status || this.restrictStatus;

            page = status.useStatusXY
                    ? page = { x: status.x, y: status.y }
                    : page = extend({}, pageCoords);

            if (status.snap && status.snap.locked) {
                page.x += status.snap.dx || 0;
                page.y += status.snap.dy || 0;
            }

            page.x -= this.inertiaStatus.resumeDx;
            page.y -= this.inertiaStatus.resumeDy;

            status.dx = 0;
            status.dy = 0;
            status.restricted = false;

            var rect, restrictedX, restrictedY;

            if (isString(restriction)) {
                if (restriction === 'parent') {
                    restriction = parentElement(this.element);
                }
                else if (restriction === 'self') {
                    restriction = target.getRect(this.element);
                }
                else {
                    restriction = closest(this.element, restriction);
                }

                if (!restriction) { return status; }
            }

            if (isFunction(restriction)) {
                restriction = restriction(page.x, page.y, this.element);
            }

            if (isElement(restriction)) {
                restriction = getElementRect(restriction);
            }

            rect = restriction;

            if (!restriction) {
                restrictedX = page.x;
                restrictedY = page.y;
            }
            // object is assumed to have
            // x, y, width, height or
            // left, top, right, bottom
            else if ('x' in restriction && 'y' in restriction) {
                restrictedX = Math.max(Math.min(rect.x + rect.width  - this.restrictOffset.right , page.x), rect.x + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.y + rect.height - this.restrictOffset.bottom, page.y), rect.y + this.restrictOffset.top );
            }
            else {
                restrictedX = Math.max(Math.min(rect.right  - this.restrictOffset.right , page.x), rect.left + this.restrictOffset.left);
                restrictedY = Math.max(Math.min(rect.bottom - this.restrictOffset.bottom, page.y), rect.top  + this.restrictOffset.top );
            }

            status.dx = restrictedX - page.x;
            status.dy = restrictedY - page.y;

            status.changed = status.restrictedX !== restrictedX || status.restrictedY !== restrictedY;
            status.restricted = !!(status.dx || status.dy);

            status.restrictedX = restrictedX;
            status.restrictedY = restrictedY;

            return status;
        },

        checkAndPreventDefault: function (event, interactable, element) {
            if (!(interactable = interactable || this.target)) { return; }

            var options = interactable.options,
                prevent = options.preventDefault;

            if (prevent === 'auto' && element && !/^input$|^textarea$/i.test(element.nodeName)) {
                // do not preventDefault on pointerdown if the prepared action is a drag
                // and dragging can only start from a certain direction - this allows
                // a touch to pan the viewport if a drag isn't in the right direction
                if (/down|start/i.test(event.type)
                    && this.prepared.name === 'drag' && options.drag.axis !== 'xy') {

                    return;
                }

                // with manualStart, only preventDefault while interacting
                if (options[this.prepared.name] && options[this.prepared.name].manualStart
                    && !this.interacting()) {
                    return;
                }

                event.preventDefault();
                return;
            }

            if (prevent === 'always') {
                event.preventDefault();
                return;
            }
        },

        calcInertia: function (status) {
            var inertiaOptions = this.target.options[this.prepared.name].inertia,
                lambda = inertiaOptions.resistance,
                inertiaDur = -Math.log(inertiaOptions.endSpeed / status.v0) / lambda;

            status.x0 = this.prevEvent.pageX;
            status.y0 = this.prevEvent.pageY;
            status.t0 = status.startEvent.timeStamp / 1000;
            status.sx = status.sy = 0;

            status.modifiedXe = status.xe = (status.vx0 - inertiaDur) / lambda;
            status.modifiedYe = status.ye = (status.vy0 - inertiaDur) / lambda;
            status.te = inertiaDur;

            status.lambda_v0 = lambda / status.v0;
            status.one_ve_v0 = 1 - inertiaOptions.endSpeed / status.v0;
        },

        _updateEventTargets: function (target, currentTarget) {
            this._eventTarget    = target;
            this._curEventTarget = currentTarget;
        }

    };

    function getInteractionFromPointer (pointer, eventType, eventTarget) {
        var i = 0, len = interactions.length,
            mouseEvent = (/mouse/i.test(pointer.pointerType || eventType)
                          // MSPointerEvent.MSPOINTER_TYPE_MOUSE
                          || pointer.pointerType === 4),
            interaction;

        var id = getPointerId(pointer);

        // try to resume inertia with a new pointer
        if (/down|start/i.test(eventType)) {
            for (i = 0; i < len; i++) {
                interaction = interactions[i];

                var element = eventTarget;

                if (interaction.inertiaStatus.active && interaction.target.options[interaction.prepared.name].inertia.allowResume
                    && (interaction.mouse === mouseEvent)) {
                    while (element) {
                        // if the element is the interaction element
                        if (element === interaction.element) {
                            // update the interaction's pointer
                            if (interaction.pointers[0]) {
                                interaction.removePointer(interaction.pointers[0]);
                            }
                            interaction.addPointer(pointer);

                            return interaction;
                        }
                        element = parentElement(element);
                    }
                }
            }
        }

        // if it's a mouse interaction
        if (mouseEvent || !(supportsTouch || supportsPointerEvent)) {

            // find a mouse interaction that's not in inertia phase
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !interactions[i].inertiaStatus.active) {
                    return interactions[i];
                }
            }

            // find any interaction specifically for mouse.
            // if the eventType is a mousedown, and inertia is active
            // ignore the interaction
            for (i = 0; i < len; i++) {
                if (interactions[i].mouse && !(/down/.test(eventType) && interactions[i].inertiaStatus.active)) {
                    return interaction;
                }
            }

            // create a new interaction for mouse
            interaction = new Interaction();
            interaction.mouse = true;

            return interaction;
        }

        // get interaction that has this pointer
        for (i = 0; i < len; i++) {
            if (contains(interactions[i].pointerIds, id)) {
                return interactions[i];
            }
        }

        // at this stage, a pointerUp should not return an interaction
        if (/up|end|out/i.test(eventType)) {
            return null;
        }

        // get first idle interaction
        for (i = 0; i < len; i++) {
            interaction = interactions[i];

            if ((!interaction.prepared.name || (interaction.target.options.gesture.enabled))
                && !interaction.interacting()
                && !(!mouseEvent && interaction.mouse)) {

                interaction.addPointer(pointer);

                return interaction;
            }
        }

        return new Interaction();
    }

    function doOnInteractions (method) {
        return (function (event) {
            var interaction,
                eventTarget = getActualElement(event.path
                                               ? event.path[0]
                                               : event.target),
                curEventTarget = getActualElement(event.currentTarget),
                i;

            if (supportsTouch && /touch/.test(event.type)) {
                prevTouchTime = new Date().getTime();

                for (i = 0; i < event.changedTouches.length; i++) {
                    var pointer = event.changedTouches[i];

                    interaction = getInteractionFromPointer(pointer, event.type, eventTarget);

                    if (!interaction) { continue; }

                    interaction._updateEventTargets(eventTarget, curEventTarget);

                    interaction[method](pointer, event, eventTarget, curEventTarget);
                }
            }
            else {
                if (!supportsPointerEvent && /mouse/.test(event.type)) {
                    // ignore mouse events while touch interactions are active
                    for (i = 0; i < interactions.length; i++) {
                        if (!interactions[i].mouse && interactions[i].pointerIsDown) {
                            return;
                        }
                    }

                    // try to ignore mouse events that are simulated by the browser
                    // after a touch event
                    if (new Date().getTime() - prevTouchTime < 500) {
                        return;
                    }
                }

                interaction = getInteractionFromPointer(event, event.type, eventTarget);

                if (!interaction) { return; }

                interaction._updateEventTargets(eventTarget, curEventTarget);

                interaction[method](event, event, eventTarget, curEventTarget);
            }
        });
    }

    function InteractEvent (interaction, event, action, phase, element, related) {
        var client,
            page,
            target      = interaction.target,
            snapStatus  = interaction.snapStatus,
            restrictStatus  = interaction.restrictStatus,
            pointers    = interaction.pointers,
            deltaSource = (target && target.options || defaultOptions).deltaSource,
            sourceX     = deltaSource + 'X',
            sourceY     = deltaSource + 'Y',
            options     = target? target.options: defaultOptions,
            origin      = getOriginXY(target, element),
            starting    = phase === 'start',
            ending      = phase === 'end',
            coords      = starting? interaction.startCoords : interaction.curCoords;

        element = element || interaction.element;

        page   = extend({}, coords.page);
        client = extend({}, coords.client);

        page.x -= origin.x;
        page.y -= origin.y;

        client.x -= origin.x;
        client.y -= origin.y;

        var relativePoints = options[action].snap && options[action].snap.relativePoints ;

        if (checkSnap(target, action) && !(starting && relativePoints && relativePoints.length)) {
            this.snap = {
                range  : snapStatus.range,
                locked : snapStatus.locked,
                x      : snapStatus.snappedX,
                y      : snapStatus.snappedY,
                realX  : snapStatus.realX,
                realY  : snapStatus.realY,
                dx     : snapStatus.dx,
                dy     : snapStatus.dy
            };

            if (snapStatus.locked) {
                page.x += snapStatus.dx;
                page.y += snapStatus.dy;
                client.x += snapStatus.dx;
                client.y += snapStatus.dy;
            }
        }

        if (checkRestrict(target, action) && !(starting && options[action].restrict.elementRect) && restrictStatus.restricted) {
            page.x += restrictStatus.dx;
            page.y += restrictStatus.dy;
            client.x += restrictStatus.dx;
            client.y += restrictStatus.dy;

            this.restrict = {
                dx: restrictStatus.dx,
                dy: restrictStatus.dy
            };
        }

        this.pageX     = page.x;
        this.pageY     = page.y;
        this.clientX   = client.x;
        this.clientY   = client.y;

        this.x0        = interaction.startCoords.page.x;
        this.y0        = interaction.startCoords.page.y;
        this.clientX0  = interaction.startCoords.client.x;
        this.clientY0  = interaction.startCoords.client.y;
        this.ctrlKey   = event.ctrlKey;
        this.altKey    = event.altKey;
        this.shiftKey  = event.shiftKey;
        this.metaKey   = event.metaKey;
        this.button    = event.button;
        this.target    = element;
        this.t0        = interaction.downTimes[0];
        this.type      = action + (phase || '');

        this.interaction = interaction;
        this.interactable = target;

        var inertiaStatus = interaction.inertiaStatus;

        if (inertiaStatus.active) {
            this.detail = 'inertia';
        }

        if (related) {
            this.relatedTarget = related;
        }

        // end event dx, dy is difference between start and end points
        if (ending) {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.startCoords.client.x;
                this.dy = client.y - interaction.startCoords.client.y;
            }
            else {
                this.dx = page.x - interaction.startCoords.page.x;
                this.dy = page.y - interaction.startCoords.page.y;
            }
        }
        else if (starting) {
            this.dx = 0;
            this.dy = 0;
        }
        // copy properties from previousmove if starting inertia
        else if (phase === 'inertiastart') {
            this.dx = interaction.prevEvent.dx;
            this.dy = interaction.prevEvent.dy;
        }
        else {
            if (deltaSource === 'client') {
                this.dx = client.x - interaction.prevEvent.clientX;
                this.dy = client.y - interaction.prevEvent.clientY;
            }
            else {
                this.dx = page.x - interaction.prevEvent.pageX;
                this.dy = page.y - interaction.prevEvent.pageY;
            }
        }
        if (interaction.prevEvent && interaction.prevEvent.detail === 'inertia'
            && !inertiaStatus.active
            && options[action].inertia && options[action].inertia.zeroResumeDelta) {

            inertiaStatus.resumeDx += this.dx;
            inertiaStatus.resumeDy += this.dy;

            this.dx = this.dy = 0;
        }

        if (action === 'resize' && interaction.resizeAxes) {
            if (options.resize.square) {
                if (interaction.resizeAxes === 'y') {
                    this.dx = this.dy;
                }
                else {
                    this.dy = this.dx;
                }
                this.axes = 'xy';
            }
            else {
                this.axes = interaction.resizeAxes;

                if (interaction.resizeAxes === 'x') {
                    this.dy = 0;
                }
                else if (interaction.resizeAxes === 'y') {
                    this.dx = 0;
                }
            }
        }
        else if (action === 'gesture') {
            this.touches = [pointers[0], pointers[1]];

            if (starting) {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = 1;
                this.ds       = 0;
                this.angle    = touchAngle(pointers, undefined, deltaSource);
                this.da       = 0;
            }
            else if (ending || event instanceof InteractEvent) {
                this.distance = interaction.prevEvent.distance;
                this.box      = interaction.prevEvent.box;
                this.scale    = interaction.prevEvent.scale;
                this.ds       = this.scale - 1;
                this.angle    = interaction.prevEvent.angle;
                this.da       = this.angle - interaction.gesture.startAngle;
            }
            else {
                this.distance = touchDistance(pointers, deltaSource);
                this.box      = touchBBox(pointers);
                this.scale    = this.distance / interaction.gesture.startDistance;
                this.angle    = touchAngle(pointers, interaction.gesture.prevAngle, deltaSource);

                this.ds = this.scale - interaction.gesture.prevScale;
                this.da = this.angle - interaction.gesture.prevAngle;
            }
        }

        if (starting) {
            this.timeStamp = interaction.downTimes[0];
            this.dt        = 0;
            this.duration  = 0;
            this.speed     = 0;
            this.velocityX = 0;
            this.velocityY = 0;
        }
        else if (phase === 'inertiastart') {
            this.timeStamp = interaction.prevEvent.timeStamp;
            this.dt        = interaction.prevEvent.dt;
            this.duration  = interaction.prevEvent.duration;
            this.speed     = interaction.prevEvent.speed;
            this.velocityX = interaction.prevEvent.velocityX;
            this.velocityY = interaction.prevEvent.velocityY;
        }
        else {
            this.timeStamp = new Date().getTime();
            this.dt        = this.timeStamp - interaction.prevEvent.timeStamp;
            this.duration  = this.timeStamp - interaction.downTimes[0];

            if (event instanceof InteractEvent) {
                var dx = this[sourceX] - interaction.prevEvent[sourceX],
                    dy = this[sourceY] - interaction.prevEvent[sourceY],
                    dt = this.dt / 1000;

                this.speed = hypot(dx, dy) / dt;
                this.velocityX = dx / dt;
                this.velocityY = dy / dt;
            }
            // if normal move or end event, use previous user event coords
            else {
                // speed and velocity in pixels per second
                this.speed = interaction.pointerDelta[deltaSource].speed;
                this.velocityX = interaction.pointerDelta[deltaSource].vx;
                this.velocityY = interaction.pointerDelta[deltaSource].vy;
            }
        }

        if ((ending || phase === 'inertiastart')
            && interaction.prevEvent.speed > 600 && this.timeStamp - interaction.prevEvent.timeStamp < 150) {

            var angle = 180 * Math.atan2(interaction.prevEvent.velocityY, interaction.prevEvent.velocityX) / Math.PI,
                overlap = 22.5;

            if (angle < 0) {
                angle += 360;
            }

            var left = 135 - overlap <= angle && angle < 225 + overlap,
                up   = 225 - overlap <= angle && angle < 315 + overlap,

                right = !left && (315 - overlap <= angle || angle <  45 + overlap),
                down  = !up   &&   45 - overlap <= angle && angle < 135 + overlap;

            this.swipe = {
                up   : up,
                down : down,
                left : left,
                right: right,
                angle: angle,
                speed: interaction.prevEvent.speed,
                velocity: {
                    x: interaction.prevEvent.velocityX,
                    y: interaction.prevEvent.velocityY
                }
            };
        }
    }

    InteractEvent.prototype = {
        preventDefault: blank,
        stopImmediatePropagation: function () {
            this.immediatePropagationStopped = this.propagationStopped = true;
        },
        stopPropagation: function () {
            this.propagationStopped = true;
        }
    };

    function preventOriginalDefault () {
        this.originalEvent.preventDefault();
    }

    function getActionCursor (action) {
        var cursor = '';

        if (action.name === 'drag') {
            cursor =  actionCursors.drag;
        }
        if (action.name === 'resize') {
            if (action.axis) {
                cursor =  actionCursors[action.name + action.axis];
            }
            else if (action.edges) {
                var cursorKey = 'resize',
                    edgeNames = ['top', 'bottom', 'left', 'right'];

                for (var i = 0; i < 4; i++) {
                    if (action.edges[edgeNames[i]]) {
                        cursorKey += edgeNames[i];
                    }
                }

                cursor = actionCursors[cursorKey];
            }
        }

        return cursor;
    }

    function checkResizeEdge (name, value, page, element, interactableElement, rect) {
        // false, '', undefined, null
        if (!value) { return false; }

        // true value, use pointer coords and element rect
        if (value === true) {
            // if dimensions are negative, "switch" edges
            var width = isNumber(rect.width)? rect.width : rect.right - rect.left,
                height = isNumber(rect.height)? rect.height : rect.bottom - rect.top;

            if (width < 0) {
                if      (name === 'left' ) { name = 'right'; }
                else if (name === 'right') { name = 'left' ; }
            }
            if (height < 0) {
                if      (name === 'top'   ) { name = 'bottom'; }
                else if (name === 'bottom') { name = 'top'   ; }
            }

            if (name === 'left'  ) { return page.x < ((width  >= 0? rect.left: rect.right ) + margin); }
            if (name === 'top'   ) { return page.y < ((height >= 0? rect.top : rect.bottom) + margin); }

            if (name === 'right' ) { return page.x > ((width  >= 0? rect.right : rect.left) - margin); }
            if (name === 'bottom') { return page.y > ((height >= 0? rect.bottom: rect.top ) - margin); }
        }

        // the remaining checks require an element
        if (!isElement(element)) { return false; }

        return isElement(value)
                    // the value is an element to use as a resize handle
                    ? value === element
                    // otherwise check if element matches value as selector
                    : matchesUpTo(element, value, interactableElement);
    }

    function defaultActionChecker (pointer, interaction, element) {
        var rect = this.getRect(element),
            shouldResize = false,
            action = null,
            resizeAxes = null,
            resizeEdges,
            page = extend({}, interaction.curCoords.page),
            options = this.options;

        if (!rect) { return null; }

        if (actionIsEnabled.resize && options.resize.enabled) {
            var resizeOptions = options.resize;

            resizeEdges = {
                left: false, right: false, top: false, bottom: false
            };

            // if using resize.edges
            if (isObject(resizeOptions.edges)) {
                for (var edge in resizeEdges) {
                    resizeEdges[edge] = checkResizeEdge(edge,
                                                        resizeOptions.edges[edge],
                                                        page,
                                                        interaction._eventTarget,
                                                        element,
                                                        rect);
                }

                resizeEdges.left = resizeEdges.left && !resizeEdges.right;
                resizeEdges.top  = resizeEdges.top  && !resizeEdges.bottom;

                shouldResize = resizeEdges.left || resizeEdges.right || resizeEdges.top || resizeEdges.bottom;
            }
            else {
                var right  = options.resize.axis !== 'y' && page.x > (rect.right  - margin),
                    bottom = options.resize.axis !== 'x' && page.y > (rect.bottom - margin);

                shouldResize = right || bottom;
                resizeAxes = (right? 'x' : '') + (bottom? 'y' : '');
            }
        }

        action = shouldResize
            ? 'resize'
            : actionIsEnabled.drag && options.drag.enabled
                ? 'drag'
                : null;

        if (actionIsEnabled.gesture
            && interaction.pointerIds.length >=2
            && !(interaction.dragging || interaction.resizing)) {
            action = 'gesture';
        }

        if (action) {
            return {
                name: action,
                axis: resizeAxes,
                edges: resizeEdges
            };
        }

        return null;
    }

    // Check if action is enabled globally and the current target supports it
    // If so, return the validated action. Otherwise, return null
    function validateAction (action, interactable) {
        if (!isObject(action)) { return null; }

        var actionName = action.name,
            options = interactable.options;

        if ((  (actionName  === 'resize'   && options.resize.enabled )
            || (actionName      === 'drag'     && options.drag.enabled  )
            || (actionName      === 'gesture'  && options.gesture.enabled))
            && actionIsEnabled[actionName]) {

            if (actionName === 'resize' || actionName === 'resizeyx') {
                actionName = 'resizexy';
            }

            return action;
        }
        return null;
    }

    var listeners = {},
        interactionListeners = [
            'dragStart', 'dragMove', 'resizeStart', 'resizeMove', 'gestureStart', 'gestureMove',
            'pointerOver', 'pointerOut', 'pointerHover', 'selectorDown',
            'pointerDown', 'pointerMove', 'pointerUp', 'pointerCancel', 'pointerEnd',
            'addPointer', 'removePointer', 'recordPointer',
        ];

    for (var i = 0, len = interactionListeners.length; i < len; i++) {
        var name = interactionListeners[i];

        listeners[name] = doOnInteractions(name);
    }

    // bound to the interactable context when a DOM event
    // listener is added to a selector interactable
    function delegateListener (event, useCapture) {
        var fakeEvent = {},
            delegated = delegatedEvents[event.type],
            eventTarget = getActualElement(event.path
                                           ? event.path[0]
                                           : event.target),
            element = eventTarget;

        useCapture = useCapture? true: false;

        // duplicate the event so that currentTarget can be changed
        for (var prop in event) {
            fakeEvent[prop] = event[prop];
        }

        fakeEvent.originalEvent = event;
        fakeEvent.preventDefault = preventOriginalDefault;

        // climb up document tree looking for selector matches
        while (isElement(element)) {
            for (var i = 0; i < delegated.selectors.length; i++) {
                var selector = delegated.selectors[i],
                    context = delegated.contexts[i];

                if (matchesSelector(element, selector)
                    && nodeContains(context, eventTarget)
                    && nodeContains(context, element)) {

                    var listeners = delegated.listeners[i];

                    fakeEvent.currentTarget = element;

                    for (var j = 0; j < listeners.length; j++) {
                        if (listeners[j][1] === useCapture) {
                            listeners[j][0](fakeEvent);
                        }
                    }
                }
            }

            element = parentElement(element);
        }
    }

    function delegateUseCapture (event) {
        return delegateListener.call(this, event, true);
    }

    interactables.indexOfElement = function indexOfElement (element, context) {
        context = context || document;

        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if ((interactable.selector === element
                && (interactable._context === context))
                || (!interactable.selector && interactable._element === element)) {

                return i;
            }
        }
        return -1;
    };

    interactables.get = function interactableGet (element, options) {
        return this[this.indexOfElement(element, options && options.context)];
    };

    interactables.forEachSelector = function (callback) {
        for (var i = 0; i < this.length; i++) {
            var interactable = this[i];

            if (!interactable.selector) {
                continue;
            }

            var ret = callback(interactable, interactable.selector, interactable._context, i, this);

            if (ret !== undefined) {
                return ret;
            }
        }
    };

    /*\
     * interact
     [ method ]
     *
     * The methods of this variable can be used to set elements as
     * interactables and also to change various default settings.
     *
     * Calling it as a function and passing an element or a valid CSS selector
     * string returns an Interactable object which has various methods to
     * configure it.
     *
     - element (Element | string) The HTML or SVG Element to interact with or CSS selector
     = (object) An @Interactable
     *
     > Usage
     | interact(document.getElementById('draggable')).draggable(true);
     |
     | var rectables = interact('rect');
     | rectables
     |     .gesturable(true)
     |     .on('gesturemove', function (event) {
     |         // something cool...
     |     })
     |     .autoScroll(true);
    \*/
    function interact (element, options) {
        return interactables.get(element, options) || new Interactable(element, options);
    }

    /*\
     * Interactable
     [ property ]
     **
     * Object type returned by @interact
    \*/
    function Interactable (element, options) {
        this._element = element;
        this._iEvents = this._iEvents || {};

        var _window;

        if (trySelector(element)) {
            this.selector = element;

            var context = options && options.context;

            _window = context? getWindow(context) : window;

            if (context && (_window.Node
                    ? context instanceof _window.Node
                    : (isElement(context) || context === _window.document))) {

                this._context = context;
            }
        }
        else {
            _window = getWindow(element);

            if (isElement(element, _window)) {

                if (PointerEvent) {
                    events.add(this._element, pEventTypes.down, listeners.pointerDown );
                    events.add(this._element, pEventTypes.move, listeners.pointerHover);
                }
                else {
                    events.add(this._element, 'mousedown' , listeners.pointerDown );
                    events.add(this._element, 'mousemove' , listeners.pointerHover);
                    events.add(this._element, 'touchstart', listeners.pointerDown );
                    events.add(this._element, 'touchmove' , listeners.pointerHover);
                }
            }
        }

        this._doc = _window.document;

        if (!contains(documents, this._doc)) {
            listenToDocument(this._doc);
        }

        interactables.push(this);

        this.set(options);
    }

    Interactable.prototype = {
        setOnEvents: function (action, phases) {
            if (action === 'drop') {
                if (isFunction(phases.ondrop)          ) { this.ondrop           = phases.ondrop          ; }
                if (isFunction(phases.ondropactivate)  ) { this.ondropactivate   = phases.ondropactivate  ; }
                if (isFunction(phases.ondropdeactivate)) { this.ondropdeactivate = phases.ondropdeactivate; }
                if (isFunction(phases.ondragenter)     ) { this.ondragenter      = phases.ondragenter     ; }
                if (isFunction(phases.ondragleave)     ) { this.ondragleave      = phases.ondragleave     ; }
                if (isFunction(phases.ondropmove)      ) { this.ondropmove       = phases.ondropmove      ; }
            }
            else {
                action = 'on' + action;

                if (isFunction(phases.onstart)       ) { this[action + 'start'         ] = phases.onstart         ; }
                if (isFunction(phases.onmove)        ) { this[action + 'move'          ] = phases.onmove          ; }
                if (isFunction(phases.onend)         ) { this[action + 'end'           ] = phases.onend           ; }
                if (isFunction(phases.oninertiastart)) { this[action + 'inertiastart'  ] = phases.oninertiastart  ; }
            }

            return this;
        },

        /*\
         * Interactable.draggable
         [ method ]
         *
         * Gets or sets whether drag actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of drag events
         | var isDraggable = interact('ul li').draggable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on drag events (object makes the Interactable draggable)
         = (object) This Interactable
         | interact(element).draggable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // the axis in which the first movement must be
         |     // for the drag sequence to start
         |     // 'xy' by default - any direction
         |     axis: 'x' || 'y' || 'xy',
         |
         |     // max number of drags that can happen concurrently
         |     // with elements of this Interactable. Infinity by default
         |     max: Infinity,
         |
         |     // max number of drags that can target the same element+Interactable
         |     // 1 by default
         |     maxPerElement: 2
         | });
        \*/
        draggable: function (options) {
            if (isObject(options)) {
                this.options.drag.enabled = options.enabled === false? false: true;
                this.setPerAction('drag', options);
                this.setOnEvents('drag', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.drag.axis = options.axis;
                }
                else if (options.axis === null) {
                    delete this.options.drag.axis;
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drag.enabled = options;

                return this;
            }

            return this.options.drag;
        },

        setPerAction: function (action, options) {
            // for all the default per-action options
            for (var option in options) {
                // if this option exists for this action
                if (option in defaultOptions[action]) {
                    // if the option in the options arg is an object value
                    if (isObject(options[option])) {
                        // duplicate the object
                        this.options[action][option] = extend(this.options[action][option] || {}, options[option]);

                        if (isObject(defaultOptions.perAction[option]) && 'enabled' in defaultOptions.perAction[option]) {
                            this.options[action][option].enabled = options[option].enabled === false? false : true;
                        }
                    }
                    else if (isBool(options[option]) && isObject(defaultOptions.perAction[option])) {
                        this.options[action][option].enabled = options[option];
                    }
                    else if (options[option] !== undefined) {
                        // or if it's not undefined, do a plain assignment
                        this.options[action][option] = options[option];
                    }
                }
            }
        },

        /*\
         * Interactable.dropzone
         [ method ]
         *
         * Returns or sets whether elements can be dropped onto this
         * Interactable to trigger drop events
         *
         * Dropzones can receive the following events:
         *  - `dropactivate` and `dropdeactivate` when an acceptable drag starts and ends
         *  - `dragenter` and `dragleave` when a draggable enters and leaves the dropzone
         *  - `dragmove` when a draggable that has entered the dropzone is moved
         *  - `drop` when a draggable is dropped into this dropzone
         *
         *  Use the `accept` option to allow only elements that match the given CSS selector or element.
         *
         *  Use the `overlap` option to set how drops are checked for. The allowed values are:
         *   - `'pointer'`, the pointer must be over the dropzone (default)
         *   - `'center'`, the draggable element's center must be over the dropzone
         *   - a number from 0-1 which is the `(intersection area) / (draggable area)`.
         *       e.g. `0.5` for drop to happen when half of the area of the
         *       draggable is over the dropzone
         *
         - options (boolean | object | null) #optional The new value to be set.
         | interact('.drop').dropzone({
         |   accept: '.can-drop' || document.getElementById('single-drop'),
         |   overlap: 'pointer' || 'center' || zeroToOne
         | }
         = (boolean | object) The current setting or this Interactable
        \*/
        dropzone: function (options) {
            if (isObject(options)) {
                this.options.drop.enabled = options.enabled === false? false: true;
                this.setOnEvents('drop', options);
                this.accept(options.accept);

                if (/^(pointer|center)$/.test(options.overlap)) {
                    this.options.drop.overlap = options.overlap;
                }
                else if (isNumber(options.overlap)) {
                    this.options.drop.overlap = Math.max(Math.min(1, options.overlap), 0);
                }

                return this;
            }

            if (isBool(options)) {
                this.options.drop.enabled = options;

                return this;
            }

            return this.options.drop;
        },

        dropCheck: function (pointer, draggable, draggableElement, dropElement, rect) {
            var dropped = false;

            // if the dropzone has no rect (eg. display: none)
            // call the custom dropChecker or just return false
            if (!(rect = rect || this.getRect(dropElement))) {
                return (this.options.dropChecker
                    ? this.options.dropChecker(pointer, dropped, this, dropElement, draggable, draggableElement)
                    : false);
            }

            var dropOverlap = this.options.drop.overlap;

            if (dropOverlap === 'pointer') {
                var page = getPageXY(pointer),
                    origin = getOriginXY(draggable, draggableElement),
                    horizontal,
                    vertical;

                page.x += origin.x;
                page.y += origin.y;

                horizontal = (page.x > rect.left) && (page.x < rect.right);
                vertical   = (page.y > rect.top ) && (page.y < rect.bottom);

                dropped = horizontal && vertical;
            }

            var dragRect = draggable.getRect(draggableElement);

            if (dropOverlap === 'center') {
                var cx = dragRect.left + dragRect.width  / 2,
                    cy = dragRect.top  + dragRect.height / 2;

                dropped = cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom;
            }

            if (isNumber(dropOverlap)) {
                var overlapArea  = (Math.max(0, Math.min(rect.right , dragRect.right ) - Math.max(rect.left, dragRect.left))
                                  * Math.max(0, Math.min(rect.bottom, dragRect.bottom) - Math.max(rect.top , dragRect.top ))),
                    overlapRatio = overlapArea / (dragRect.width * dragRect.height);

                dropped = overlapRatio >= dropOverlap;
            }

            if (this.options.dropChecker) {
                dropped = this.options.dropChecker(pointer, dropped, this, dropElement, draggable, draggableElement);
            }

            return dropped;
        },

        /*\
         * Interactable.dropChecker
         [ method ]
         *
         * Gets or sets the function used to check if a dragged element is
         * over this Interactable. See @Interactable.dropCheck.
         *
         - checker (function) #optional
         * The checker is a function which takes a mouseUp/touchEnd event as a
         * parameter and returns true or false to indicate if the the current
         * draggable can be dropped into this Interactable
         *
         - checker (function) The function that will be called when checking for a drop
         * The checker function takes the following arguments:
         *
         - pointer (MouseEvent | PointerEvent | Touch) The pointer/event that ends a drag
         - dropped (boolean) The value from the default drop check
         - dropzone (Interactable) The dropzone interactable
         - dropElement (Element) The dropzone element
         - draggable (Interactable) The Interactable being dragged
         - draggableElement (Element) The actual element that's being dragged
         *
         = (Function | Interactable) The checker function or this Interactable
        \*/
        dropChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.dropChecker = checker;

                return this;
            }
            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.options.dropChecker;
        },

        /*\
         * Interactable.accept
         [ method ]
         *
         * Deprecated. add an `accept` property to the options object passed to
         * @Interactable.dropzone instead.
         *
         * Gets or sets the Element or CSS selector match that this
         * Interactable accepts if it is a dropzone.
         *
         - newValue (Element | string | null) #optional
         * If it is an Element, then only that element can be dropped into this dropzone.
         * If it is a string, the element being dragged must match it as a selector.
         * If it is null, the accept options is cleared - it accepts any element.
         *
         = (string | Element | null | Interactable) The current accept option if given `undefined` or this Interactable
        \*/
        accept: function (newValue) {
            if (isElement(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            // test if it is a valid CSS selector
            if (trySelector(newValue)) {
                this.options.drop.accept = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.drop.accept;

                return this;
            }

            return this.options.drop.accept;
        },

        /*\
         * Interactable.resizable
         [ method ]
         *
         * Gets or sets whether resize actions can be performed on the
         * Interactable
         *
         = (boolean) Indicates if this can be the target of resize elements
         | var isResizeable = interact('input[type=text]').resizable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on resize events (object makes the Interactable resizable)
         = (object) This Interactable
         | interact(element).resizable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     edges: {
         |       top   : true,       // Use pointer coords to check for resize.
         |       left  : false,      // Disable resizing from left edge.
         |       bottom: '.resize-s',// Resize if pointer target matches selector
         |       right : handleEl    // Resize if pointer target is the given Element
         |     },
         |
         |     // a value of 'none' will limit the resize rect to a minimum of 0x0
         |     // 'negate' will allow the rect to have negative width/height
         |     // 'reposition' will keep the width/height positive by swapping
         |     // the top and bottom edges and/or swapping the left and right edges
         |     invert: 'none' || 'negate' || 'reposition'
         |
         |     // limit multiple resizes.
         |     // See the explanation in the @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        resizable: function (options) {
            if (isObject(options)) {
                this.options.resize.enabled = options.enabled === false? false: true;
                this.setPerAction('resize', options);
                this.setOnEvents('resize', options);

                if (/^x$|^y$|^xy$/.test(options.axis)) {
                    this.options.resize.axis = options.axis;
                }
                else if (options.axis === null) {
                    this.options.resize.axis = defaultOptions.resize.axis;
                }

                if (isBool(options.square)) {
                    this.options.resize.square = options.square;
                }

                return this;
            }
            if (isBool(options)) {
                this.options.resize.enabled = options;

                return this;
            }
            return this.options.resize;
        },

        /*\
         * Interactable.squareResize
         [ method ]
         *
         * Deprecated. Add a `square: true || false` property to @Interactable.resizable instead
         *
         * Gets or sets whether resizing is forced 1:1 aspect
         *
         = (boolean) Current setting
         *
         * or
         *
         - newValue (boolean) #optional
         = (object) this Interactable
        \*/
        squareResize: function (newValue) {
            if (isBool(newValue)) {
                this.options.resize.square = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.resize.square;

                return this;
            }

            return this.options.resize.square;
        },

        /*\
         * Interactable.gesturable
         [ method ]
         *
         * Gets or sets whether multitouch gestures can be performed on the
         * Interactable's element
         *
         = (boolean) Indicates if this can be the target of gesture events
         | var isGestureable = interact(element).gesturable();
         * or
         - options (boolean | object) #optional true/false or An object with event listeners to be fired on gesture events (makes the Interactable gesturable)
         = (object) this Interactable
         | interact(element).gesturable({
         |     onstart: function (event) {},
         |     onmove : function (event) {},
         |     onend  : function (event) {},
         |
         |     // limit multiple gestures.
         |     // See the explanation in @Interactable.draggable example
         |     max: Infinity,
         |     maxPerElement: 1,
         | });
        \*/
        gesturable: function (options) {
            if (isObject(options)) {
                this.options.gesture.enabled = options.enabled === false? false: true;
                this.setPerAction('gesture', options);
                this.setOnEvents('gesture', options);

                return this;
            }

            if (isBool(options)) {
                this.options.gesture.enabled = options;

                return this;
            }

            return this.options.gesture;
        },

        /*\
         * Interactable.autoScroll
         [ method ]
         **
         * Deprecated. Add an `autoscroll` property to the options object
         * passed to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets whether dragging and resizing near the edges of the
         * window/container trigger autoScroll for this Interactable
         *
         = (object) Object with autoScroll properties
         *
         * or
         *
         - options (object | boolean) #optional
         * options can be:
         * - an object with margin, distance and interval properties,
         * - true or false to enable or disable autoScroll or
         = (Interactable) this Interactable
        \*/
        autoScroll: function (options) {
            if (isObject(options)) {
                options = extend({ actions: ['drag', 'resize']}, options);
            }
            else if (isBool(options)) {
                options = { actions: ['drag', 'resize'], enabled: options };
            }

            return this.setOptions('autoScroll', options);
        },

        /*\
         * Interactable.snap
         [ method ]
         **
         * Deprecated. Add a `snap` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how action coordinates are snapped. By
         * default, snapping is relative to the pointer coordinates. You can
         * change this by setting the
         * [`elementOrigin`](https://github.com/taye/interact.js/pull/72).
         **
         = (boolean | object) `false` if snap is disabled; object with snap properties if snap is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | interact(document.querySelector('#thing')).snap({
         |     targets: [
         |         // snap to this specific point
         |         {
         |             x: 100,
         |             y: 100,
         |             range: 25
         |         },
         |         // give this function the x and y page coords and snap to the object returned
         |         function (x, y) {
         |             return {
         |                 x: x,
         |                 y: (75 + 50 * Math.sin(x * 0.04)),
         |                 range: 40
         |             };
         |         },
         |         // create a function that snaps to a grid
         |         interact.createSnapGrid({
         |             x: 50,
         |             y: 50,
         |             range: 10,              // optional
         |             offset: { x: 5, y: 10 } // optional
         |         })
         |     ],
         |     // do not snap during normal movement.
         |     // Instead, trigger only one snapped move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     relativePoints: [
         |         { x: 0, y: 0 },  // snap relative to the top left of the element
         |         { x: 1, y: 1 },  // and also to the bottom right
         |     ],  
         |
         |     // offset the snap target coordinates
         |     // can be an object with x/y or 'startCoords'
         |     offset: { x: 50, y: 50 }
         |   }
         | });
        \*/
        snap: function (options) {
            var ret = this.setOptions('snap', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        setOptions: function (option, options) {
            var actions = options && isArray(options.actions)
                    ? options.actions
                    : ['drag'];

            var i;

            if (isObject(options) || isBool(options)) {
                for (i = 0; i < actions.length; i++) {
                    var action = /resize/.test(actions[i])? 'resize' : actions[i];

                    if (!isObject(this.options[action])) { continue; }

                    var thisOption = this.options[action][option];

                    if (isObject(options)) {
                        extend(thisOption, options);
                        thisOption.enabled = options.enabled === false? false: true;

                        if (option === 'snap') {
                            if (thisOption.mode === 'grid') {
                                thisOption.targets = [
                                    interact.createSnapGrid(extend({
                                        offset: thisOption.gridOffset || { x: 0, y: 0 }
                                    }, thisOption.grid || {}))
                                ];
                            }
                            else if (thisOption.mode === 'anchor') {
                                thisOption.targets = thisOption.anchors;
                            }
                            else if (thisOption.mode === 'path') {
                                thisOption.targets = thisOption.paths;
                            }

                            if ('elementOrigin' in options) {
                                thisOption.relativePoints = [options.elementOrigin];
                            }
                        }
                    }
                    else if (isBool(options)) {
                        thisOption.enabled = options;
                    }
                }

                return this;
            }

            var ret = {},
                allActions = ['drag', 'resize', 'gesture'];

            for (i = 0; i < allActions.length; i++) {
                if (option in defaultOptions[allActions[i]]) {
                    ret[allActions[i]] = this.options[allActions[i]][option];
                }
            }

            return ret;
        },


        /*\
         * Interactable.inertia
         [ method ]
         **
         * Deprecated. Add an `inertia` property to the options object passed
         * to @Interactable.draggable or @Interactable.resizable instead.
         *
         * Returns or sets if and how events continue to run after the pointer is released
         **
         = (boolean | object) `false` if inertia is disabled; `object` with inertia properties if inertia is enabled
         **
         * or
         **
         - options (object | boolean | null) #optional
         = (Interactable) this Interactable
         > Usage
         | // enable and use default settings
         | interact(element).inertia(true);
         |
         | // enable and use custom settings
         | interact(element).inertia({
         |     // value greater than 0
         |     // high values slow the object down more quickly
         |     resistance     : 16,
         |
         |     // the minimum launch speed (pixels per second) that results in inertia start
         |     minSpeed       : 200,
         |
         |     // inertia will stop when the object slows down to this speed
         |     endSpeed       : 20,
         |
         |     // boolean; should actions be resumed when the pointer goes down during inertia
         |     allowResume    : true,
         |
         |     // boolean; should the jump when resuming from inertia be ignored in event.dx/dy
         |     zeroResumeDelta: false,
         |
         |     // if snap/restrict are set to be endOnly and inertia is enabled, releasing
         |     // the pointer without triggering inertia will animate from the release
         |     // point to the snaped/restricted point in the given amount of time (ms)
         |     smoothEndDuration: 300,
         |
         |     // an array of action types that can have inertia (no gesture)
         |     actions        : ['drag', 'resize']
         | });
         |
         | // reset custom settings and use all defaults
         | interact(element).inertia(null);
        \*/
        inertia: function (options) {
            var ret = this.setOptions('inertia', options);

            if (ret === this) { return this; }

            return ret.drag;
        },

        getAction: function (pointer, interaction, element) {
            var action = this.defaultActionChecker(pointer, interaction, element);

            if (this.options.actionChecker) {
                return this.options.actionChecker(pointer, action, this, element, interaction);
            }

            return action;
        },

        defaultActionChecker: defaultActionChecker,

        /*\
         * Interactable.actionChecker
         [ method ]
         *
         * Gets or sets the function used to check action to be performed on
         * pointerDown
         *
         - checker (function | null) #optional A function which takes a pointer event, defaultAction string, interactable, element and interaction as parameters and returns an object with name property 'drag' 'resize' or 'gesture' and optionally an `edges` object with boolean 'top', 'left', 'bottom' and right props.
         = (Function | Interactable) The checker function or this Interactable
         *
         | interact('.resize-horiz').actionChecker(function (defaultAction, interactable) {
         |   return {
         |     // resize from the top and right edges
         |     name: 'resize',
         |     edges: { top: true, right: true }
         |   };
         | });
        \*/
        actionChecker: function (checker) {
            if (isFunction(checker)) {
                this.options.actionChecker = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.actionChecker;

                return this;
            }

            return this.options.actionChecker;
        },

        /*\
         * Interactable.getRect
         [ method ]
         *
         * The default function to get an Interactables bounding rect. Can be
         * overridden using @Interactable.rectChecker.
         *
         - element (Element) #optional The element to measure.
         = (object) The object's bounding rectangle.
         o {
         o     top   : 0,
         o     left  : 0,
         o     bottom: 0,
         o     right : 0,
         o     width : 0,
         o     height: 0
         o }
        \*/
        getRect: function rectCheck (element) {
            element = element || this._element;

            if (this.selector && !(isElement(element))) {
                element = this._context.querySelector(this.selector);
            }

            return getElementRect(element);
        },

        /*\
         * Interactable.rectChecker
         [ method ]
         *
         * Returns or sets the function used to calculate the interactable's
         * element's rectangle
         *
         - checker (function) #optional A function which returns this Interactable's bounding rectangle. See @Interactable.getRect
         = (function | object) The checker function or this Interactable
        \*/
        rectChecker: function (checker) {
            if (isFunction(checker)) {
                this.getRect = checker;

                return this;
            }

            if (checker === null) {
                delete this.options.getRect;

                return this;
            }

            return this.getRect;
        },

        /*\
         * Interactable.styleCursor
         [ method ]
         *
         * Returns or sets whether the action that would be performed when the
         * mouse on the element are checked on `mousemove` so that the cursor
         * may be styled appropriately
         *
         - newValue (boolean) #optional
         = (boolean | Interactable) The current setting or this Interactable
        \*/
        styleCursor: function (newValue) {
            if (isBool(newValue)) {
                this.options.styleCursor = newValue;

                return this;
            }

            if (newValue === null) {
                delete this.options.styleCursor;

                return this;
            }

            return this.options.styleCursor;
        },

        /*\
         * Interactable.preventDefault
         [ method ]
         *
         * Returns or sets whether to prevent the browser's default behaviour
         * in response to pointer events. Can be set to:
         *  - `'always'` to always prevent
         *  - `'never'` to never prevent
         *  - `'auto'` to let interact.js try to determine what would be best
         *
         - newValue (string) #optional `true`, `false` or `'auto'`
         = (string | Interactable) The current setting or this Interactable
        \*/
        preventDefault: function (newValue) {
            if (/^(always|never|auto)$/.test(newValue)) {
                this.options.preventDefault = newValue;
                return this;
            }

            if (isBool(newValue)) {
                this.options.preventDefault = newValue? 'always' : 'never';
                return this;
            }

            return this.options.preventDefault;
        },

        /*\
         * Interactable.origin
         [ method ]
         *
         * Gets or sets the origin of the Interactable's element.  The x and y
         * of the origin will be subtracted from action event coordinates.
         *
         - origin (object | string) #optional An object eg. { x: 0, y: 0 } or string 'parent', 'self' or any CSS selector
         * OR
         - origin (Element) #optional An HTML or SVG Element whose rect will be used
         **
         = (object) The current origin or this Interactable
        \*/
        origin: function (newValue) {
            if (trySelector(newValue)) {
                this.options.origin = newValue;
                return this;
            }
            else if (isObject(newValue)) {
                this.options.origin = newValue;
                return this;
            }

            return this.options.origin;
        },

        /*\
         * Interactable.deltaSource
         [ method ]
         *
         * Returns or sets the mouse coordinate types used to calculate the
         * movement of the pointer.
         *
         - newValue (string) #optional Use 'client' if you will be scrolling while interacting; Use 'page' if you want autoScroll to work
         = (string | object) The current deltaSource or this Interactable
        \*/
        deltaSource: function (newValue) {
            if (newValue === 'page' || newValue === 'client') {
                this.options.deltaSource = newValue;

                return this;
            }

            return this.options.deltaSource;
        },

        /*\
         * Interactable.restrict
         [ method ]
         **
         * Deprecated. Add a `restrict` property to the options object passed to
         * @Interactable.draggable, @Interactable.resizable or @Interactable.gesturable instead.
         *
         * Returns or sets the rectangles within which actions on this
         * interactable (after snap calculations) are restricted. By default,
         * restricting is relative to the pointer coordinates. You can change
         * this by setting the
         * [`elementRect`](https://github.com/taye/interact.js/pull/72).
         **
         - options (object) #optional an object with keys drag, resize, and/or gesture whose values are rects, Elements, CSS selectors, or 'parent' or 'self'
         = (object) The current restrictions object or this Interactable
         **
         | interact(element).restrict({
         |     // the rect will be `interact.getElementRect(element.parentNode)`
         |     drag: element.parentNode,
         |
         |     // x and y are relative to the the interactable's origin
         |     resize: { x: 100, y: 100, width: 200, height: 200 }
         | })
         |
         | interact('.draggable').restrict({
         |     // the rect will be the selected element's parent
         |     drag: 'parent',
         |
         |     // do not restrict during normal movement.
         |     // Instead, trigger only one restricted move event
         |     // immediately before the end event.
         |     endOnly: true,
         |
         |     // https://github.com/taye/interact.js/pull/72#issue-41813493
         |     elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
         | });
        \*/
        restrict: function (options) {
            if (!isObject(options)) {
                return this.setOptions('restrict', options);
            }

            var actions = ['drag', 'resize', 'gesture'],
                ret;

            for (var i = 0; i < actions.length; i++) {
                var action = actions[i];

                if (action in options) {
                    var perAction = extend({
                            actions: [action],
                            restriction: options[action]
                        }, options);

                    ret = this.setOptions('restrict', perAction);
                }
            }

            return ret;
        },

        /*\
         * Interactable.context
         [ method ]
         *
         * Gets the selector context Node of the Interactable. The default is `window.document`.
         *
         = (Node) The context Node of this Interactable
         **
        \*/
        context: function () {
            return this._context;
        },

        _context: document,

        /*\
         * Interactable.ignoreFrom
         [ method ]
         *
         * If the target of the `mousedown`, `pointerdown` or `touchstart`
         * event or any of it's parents match the given CSS selector or
         * Element, no drag/resize/gesture is started.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to not ignore any elements
         = (string | Element | object) The current ignoreFrom value or this Interactable
         **
         | interact(element, { ignoreFrom: document.getElementById('no-action') });
         | // or
         | interact(element).ignoreFrom('input, textarea, a');
        \*/
        ignoreFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.ignoreFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.ignoreFrom = newValue;
                return this;
            }

            return this.options.ignoreFrom;
        },

        /*\
         * Interactable.allowFrom
         [ method ]
         *
         * A drag/resize/gesture is started only If the target of the
         * `mousedown`, `pointerdown` or `touchstart` event or any of it's
         * parents match the given CSS selector or Element.
         *
         - newValue (string | Element | null) #optional a CSS selector string, an Element or `null` to allow from any element
         = (string | Element | object) The current allowFrom value or this Interactable
         **
         | interact(element, { allowFrom: document.getElementById('drag-handle') });
         | // or
         | interact(element).allowFrom('.handle');
        \*/
        allowFrom: function (newValue) {
            if (trySelector(newValue)) {            // CSS selector to match event.target
                this.options.allowFrom = newValue;
                return this;
            }

            if (isElement(newValue)) {              // specific element
                this.options.allowFrom = newValue;
                return this;
            }

            return this.options.allowFrom;
        },

        /*\
         * Interactable.element
         [ method ]
         *
         * If this is not a selector Interactable, it returns the element this
         * interactable represents
         *
         = (Element) HTML / SVG Element
        \*/
        element: function () {
            return this._element;
        },

        /*\
         * Interactable.fire
         [ method ]
         *
         * Calls listeners for the given InteractEvent type bound globally
         * and directly to this Interactable
         *
         - iEvent (InteractEvent) The InteractEvent object to be fired on this Interactable
         = (Interactable) this Interactable
        \*/
        fire: function (iEvent) {
            if (!(iEvent && iEvent.type) || !contains(eventTypes, iEvent.type)) {
                return this;
            }

            var listeners,
                i,
                len,
                onEvent = 'on' + iEvent.type,
                funcName = '';

            // Interactable#on() listeners
            if (iEvent.type in this._iEvents) {
                listeners = this._iEvents[iEvent.type];

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            // interactable.onevent listener
            if (isFunction(this[onEvent])) {
                funcName = this[onEvent].name;
                this[onEvent](iEvent);
            }

            // interact.on() listeners
            if (iEvent.type in globalEvents && (listeners = globalEvents[iEvent.type]))  {

                for (i = 0, len = listeners.length; i < len && !iEvent.immediatePropagationStopped; i++) {
                    funcName = listeners[i].name;
                    listeners[i](iEvent);
                }
            }

            return this;
        },

        /*\
         * Interactable.on
         [ method ]
         *
         * Binds a listener for an InteractEvent or DOM event.
         *
         - eventType  (string | array | object) The types of events to listen for
         - listener   (function) The function to be called on the given event(s)
         - useCapture (boolean) #optional useCapture flag for addEventListener
         = (object) This Interactable
        \*/
        on: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.on(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.on(prop, eventType[prop], listener);
                }

                return this;
            }

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // convert to boolean
            useCapture = useCapture? true: false;

            if (contains(eventTypes, eventType)) {
                // if this type of event was never bound to this Interactable
                if (!(eventType in this._iEvents)) {
                    this._iEvents[eventType] = [listener];
                }
                else {
                    this._iEvents[eventType].push(listener);
                }
            }
            // delegated event for selector
            else if (this.selector) {
                if (!delegatedEvents[eventType]) {
                    delegatedEvents[eventType] = {
                        selectors: [],
                        contexts : [],
                        listeners: []
                    };

                    // add delegate listener functions
                    for (i = 0; i < documents.length; i++) {
                        events.add(documents[i], eventType, delegateListener);
                        events.add(documents[i], eventType, delegateUseCapture, true);
                    }
                }

                var delegated = delegatedEvents[eventType],
                    index;

                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {
                        break;
                    }
                }

                if (index === -1) {
                    index = delegated.selectors.length;

                    delegated.selectors.push(this.selector);
                    delegated.contexts .push(this._context);
                    delegated.listeners.push([]);
                }

                // keep listener and useCapture flag
                delegated.listeners[index].push([listener, useCapture]);
            }
            else {
                events.add(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.off
         [ method ]
         *
         * Removes an InteractEvent or DOM event listener
         *
         - eventType  (string | array | object) The types of events that were listened for
         - listener   (function) The listener function to be removed
         - useCapture (boolean) #optional useCapture flag for removeEventListener
         = (object) This Interactable
        \*/
        off: function (eventType, listener, useCapture) {
            var i;

            if (isString(eventType) && eventType.search(' ') !== -1) {
                eventType = eventType.trim().split(/ +/);
            }

            if (isArray(eventType)) {
                for (i = 0; i < eventType.length; i++) {
                    this.off(eventType[i], listener, useCapture);
                }

                return this;
            }

            if (isObject(eventType)) {
                for (var prop in eventType) {
                    this.off(prop, eventType[prop], listener);
                }

                return this;
            }

            var eventList,
                index = -1;

            // convert to boolean
            useCapture = useCapture? true: false;

            if (eventType === 'wheel') {
                eventType = wheelEvent;
            }

            // if it is an action event type
            if (contains(eventTypes, eventType)) {
                eventList = this._iEvents[eventType];

                if (eventList && (index = indexOf(eventList, listener)) !== -1) {
                    this._iEvents[eventType].splice(index, 1);
                }
            }
            // delegated event
            else if (this.selector) {
                var delegated = delegatedEvents[eventType],
                    matchFound = false;

                if (!delegated) { return this; }

                // count from last index of delegated to 0
                for (index = delegated.selectors.length - 1; index >= 0; index--) {
                    // look for matching selector and context Node
                    if (delegated.selectors[index] === this.selector
                        && delegated.contexts[index] === this._context) {

                        var listeners = delegated.listeners[index];

                        // each item of the listeners array is an array: [function, useCaptureFlag]
                        for (i = listeners.length - 1; i >= 0; i--) {
                            var fn = listeners[i][0],
                                useCap = listeners[i][1];

                            // check if the listener functions and useCapture flags match
                            if (fn === listener && useCap === useCapture) {
                                // remove the listener from the array of listeners
                                listeners.splice(i, 1);

                                // if all listeners for this interactable have been removed
                                // remove the interactable from the delegated arrays
                                if (!listeners.length) {
                                    delegated.selectors.splice(index, 1);
                                    delegated.contexts .splice(index, 1);
                                    delegated.listeners.splice(index, 1);

                                    // remove delegate function from context
                                    events.remove(this._context, eventType, delegateListener);
                                    events.remove(this._context, eventType, delegateUseCapture, true);

                                    // remove the arrays if they are empty
                                    if (!delegated.selectors.length) {
                                        delegatedEvents[eventType] = null;
                                    }
                                }

                                // only remove one listener
                                matchFound = true;
                                break;
                            }
                        }

                        if (matchFound) { break; }
                    }
                }
            }
            // remove listener from this Interatable's element
            else {
                events.remove(this._element, eventType, listener, useCapture);
            }

            return this;
        },

        /*\
         * Interactable.set
         [ method ]
         *
         * Reset the options of this Interactable
         - options (object) The new settings to apply
         = (object) This Interactablw
        \*/
        set: function (options) {
            if (!isObject(options)) {
                options = {};
            }

            this.options = extend({}, defaultOptions.base);

            var i,
                actions = ['drag', 'drop', 'resize', 'gesture'],
                methods = ['draggable', 'dropzone', 'resizable', 'gesturable'],
                perActions = extend(extend({}, defaultOptions.perAction), options[action] || {});

            for (i = 0; i < actions.length; i++) {
                var action = actions[i];

                this.options[action] = extend({}, defaultOptions[action]);

                this.setPerAction(action, perActions);

                this[methods[i]](options[action]);
            }

            var settings = [
                    'accept', 'actionChecker', 'allowFrom', 'deltaSource',
                    'dropChecker', 'ignoreFrom', 'origin', 'preventDefault',
                    'rectChecker'
                ];

            for (i = 0, len = settings.length; i < len; i++) {
                var setting = settings[i];

                this.options[setting] = defaultOptions.base[setting];

                if (setting in options) {
                    this[setting](options[setting]);
                }
            }

            return this;
        },

        /*\
         * Interactable.unset
         [ method ]
         *
         * Remove this interactable from the list of interactables and remove
         * it's drag, drop, resize and gesture capabilities
         *
         = (object) @interact
        \*/
        unset: function () {
            events.remove(this, 'all');

            if (!isString(this.selector)) {
                events.remove(this, 'all');
                if (this.options.styleCursor) {
                    this._element.style.cursor = '';
                }
            }
            else {
                // remove delegated events
                for (var type in delegatedEvents) {
                    var delegated = delegatedEvents[type];

                    for (var i = 0; i < delegated.selectors.length; i++) {
                        if (delegated.selectors[i] === this.selector
                            && delegated.contexts[i] === this._context) {

                            delegated.selectors.splice(i, 1);
                            delegated.contexts .splice(i, 1);
                            delegated.listeners.splice(i, 1);

                            // remove the arrays if they are empty
                            if (!delegated.selectors.length) {
                                delegatedEvents[type] = null;
                            }
                        }

                        events.remove(this._context, type, delegateListener);
                        events.remove(this._context, type, delegateUseCapture, true);

                        break;
                    }
                }
            }

            this.dropzone(false);

            interactables.splice(indexOf(interactables, this), 1);

            return interact;
        }
    };

    function warnOnce (method, message) {
        var warned = false;

        return function () {
            if (!warned) {
                window.console.warn(message);
                warned = true;
            }

            return method.apply(this, arguments);
        };
    }

    Interactable.prototype.snap = warnOnce(Interactable.prototype.snap,
         'Interactable#snap is deprecated. See the new documentation for snapping at http://interactjs.io/docs/snapping');
    Interactable.prototype.restrict = warnOnce(Interactable.prototype.restrict,
         'Interactable#restrict is deprecated. See the new documentation for resticting at http://interactjs.io/docs/restriction');
    Interactable.prototype.inertia = warnOnce(Interactable.prototype.inertia,
         'Interactable#inertia is deprecated. See the new documentation for inertia at http://interactjs.io/docs/inertia');
    Interactable.prototype.autoScroll = warnOnce(Interactable.prototype.autoScroll,
         'Interactable#autoScroll is deprecated. See the new documentation for autoScroll at http://interactjs.io/docs/#autoscroll');

    /*\
     * interact.isSet
     [ method ]
     *
     * Check if an element has been set
     - element (Element) The Element being searched for
     = (boolean) Indicates if the element or CSS selector was previously passed to interact
    \*/
    interact.isSet = function(element, options) {
        return interactables.indexOfElement(element, options && options.context) !== -1;
    };

    /*\
     * interact.on
     [ method ]
     *
     * Adds a global listener for an InteractEvent or adds a DOM event to
     * `document`
     *
     - type       (string | array | object) The types of events to listen for
     - listener   (function) The function to be called on the given event(s)
     - useCapture (boolean) #optional useCapture flag for addEventListener
     = (object) interact
    \*/
    interact.on = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.on(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.on(prop, type[prop], listener);
            }

            return interact;
        }

        // if it is an InteractEvent type, add listener to globalEvents
        if (contains(eventTypes, type)) {
            // if this type of event was never bound
            if (!globalEvents[type]) {
                globalEvents[type] = [listener];
            }
            else {
                globalEvents[type].push(listener);
            }
        }
        // If non InteractEvent type, addEventListener to document
        else {
            events.add(document, type, listener, useCapture);
        }

        return interact;
    };

    /*\
     * interact.off
     [ method ]
     *
     * Removes a global InteractEvent listener or DOM event from `document`
     *
     - type       (string | array | object) The types of events that were listened for
     - listener   (function) The listener function to be removed
     - useCapture (boolean) #optional useCapture flag for removeEventListener
     = (object) interact
     \*/
    interact.off = function (type, listener, useCapture) {
        if (isString(type) && type.search(' ') !== -1) {
            type = type.trim().split(/ +/);
        }

        if (isArray(type)) {
            for (var i = 0; i < type.length; i++) {
                interact.off(type[i], listener, useCapture);
            }

            return interact;
        }

        if (isObject(type)) {
            for (var prop in type) {
                interact.off(prop, type[prop], listener);
            }

            return interact;
        }

        if (!contains(eventTypes, type)) {
            events.remove(document, type, listener, useCapture);
        }
        else {
            var index;

            if (type in globalEvents
                && (index = indexOf(globalEvents[type], listener)) !== -1) {
                globalEvents[type].splice(index, 1);
            }
        }

        return interact;
    };

    /*\
     * interact.enableDragging
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether dragging is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableDragging = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.drag = newValue;

            return interact;
        }
        return actionIsEnabled.drag;
    }, 'interact.enableDragging is deprecated and will soon be removed.');

    /*\
     * interact.enableResizing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether resizing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableResizing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.resize = newValue;

            return interact;
        }
        return actionIsEnabled.resize;
    }, 'interact.enableResizing is deprecated and will soon be removed.');

    /*\
     * interact.enableGesturing
     [ method ]
     *
     * Deprecated.
     *
     * Returns or sets whether gesturing is enabled for any Interactables
     *
     - newValue (boolean) #optional `true` to allow the action; `false` to disable action for all Interactables
     = (boolean | object) The current setting or interact
    \*/
    interact.enableGesturing = warnOnce(function (newValue) {
        if (newValue !== null && newValue !== undefined) {
            actionIsEnabled.gesture = newValue;

            return interact;
        }
        return actionIsEnabled.gesture;
    }, 'interact.enableGesturing is deprecated and will soon be removed.');

    interact.eventTypes = eventTypes;

    /*\
     * interact.debug
     [ method ]
     *
     * Returns debugging data
     = (object) An object with properties that outline the current state and expose internal functions and variables
    \*/
    interact.debug = function () {
        var interaction = interactions[0] || new Interaction();

        return {
            interactions          : interactions,
            target                : interaction.target,
            dragging              : interaction.dragging,
            resizing              : interaction.resizing,
            gesturing             : interaction.gesturing,
            prepared              : interaction.prepared,
            matches               : interaction.matches,
            matchElements         : interaction.matchElements,

            prevCoords            : interaction.prevCoords,
            startCoords           : interaction.startCoords,

            pointerIds            : interaction.pointerIds,
            pointers              : interaction.pointers,
            addPointer            : listeners.addPointer,
            removePointer         : listeners.removePointer,
            recordPointer        : listeners.recordPointer,

            snap                  : interaction.snapStatus,
            restrict              : interaction.restrictStatus,
            inertia               : interaction.inertiaStatus,

            downTime              : interaction.downTimes[0],
            downEvent             : interaction.downEvent,
            downPointer           : interaction.downPointer,
            prevEvent             : interaction.prevEvent,

            Interactable          : Interactable,
            interactables         : interactables,
            pointerIsDown         : interaction.pointerIsDown,
            defaultOptions        : defaultOptions,
            defaultActionChecker  : defaultActionChecker,

            actionCursors         : actionCursors,
            dragMove              : listeners.dragMove,
            resizeMove            : listeners.resizeMove,
            gestureMove           : listeners.gestureMove,
            pointerUp             : listeners.pointerUp,
            pointerDown           : listeners.pointerDown,
            pointerMove           : listeners.pointerMove,
            pointerHover          : listeners.pointerHover,

            events                : events,
            globalEvents          : globalEvents,
            delegatedEvents       : delegatedEvents
        };
    };

    // expose the functions used to calculate multi-touch properties
    interact.getTouchAverage  = touchAverage;
    interact.getTouchBBox     = touchBBox;
    interact.getTouchDistance = touchDistance;
    interact.getTouchAngle    = touchAngle;

    interact.getElementRect   = getElementRect;
    interact.matchesSelector  = matchesSelector;
    interact.closest          = closest;

    /*\
     * interact.margin
     [ method ]
     *
     * Returns or sets the margin for autocheck resizing used in
     * @Interactable.getAction. That is the distance from the bottom and right
     * edges of an element clicking in which will start resizing
     *
     - newValue (number) #optional
     = (number | interact) The current margin value or interact
    \*/
    interact.margin = function (newvalue) {
        if (isNumber(newvalue)) {
            margin = newvalue;

            return interact;
        }
        return margin;
    };

    /*\
     * interact.supportsTouch
     [ method ]
     *
     = (boolean) Whether or not the browser supports touch input
    \*/
    interact.supportsTouch = function () {
        return supportsTouch;
    };

    /*\
     * interact.supportsPointerEvent
     [ method ]
     *
     = (boolean) Whether or not the browser supports PointerEvents
    \*/
    interact.supportsPointerEvent = function () {
        return supportsPointerEvent;
    };

    /*\
     * interact.stop
     [ method ]
     *
     * Cancels all interactions (end events are not fired)
     *
     - event (Event) An event on which to call preventDefault()
     = (object) interact
    \*/
    interact.stop = function (event) {
        for (var i = interactions.length - 1; i > 0; i--) {
            interactions[i].stop(event);
        }

        return interact;
    };

    /*\
     * interact.dynamicDrop
     [ method ]
     *
     * Returns or sets whether the dimensions of dropzone elements are
     * calculated on every dragmove or only on dragstart for the default
     * dropChecker
     *
     - newValue (boolean) #optional True to check on each move. False to check only before start
     = (boolean | interact) The current setting or interact
    \*/
    interact.dynamicDrop = function (newValue) {
        if (isBool(newValue)) {
            //if (dragging && dynamicDrop !== newValue && !newValue) {
                //calcRects(dropzones);
            //}

            dynamicDrop = newValue;

            return interact;
        }
        return dynamicDrop;
    };

    /*\
     * interact.pointerMoveTolerance
     [ method ]
     * Returns or sets the distance the pointer must be moved before an action
     * sequence occurs. This also affects tolerance for tap events.
     *
     - newValue (number) #optional The movement from the start position must be greater than this value
     = (number | Interactable) The current setting or interact
    \*/
    interact.pointerMoveTolerance = function (newValue) {
        if (isNumber(newValue)) {
            pointerMoveTolerance = newValue;

            return this;
        }

        return pointerMoveTolerance;
    };

    /*\
     * interact.maxInteractions
     [ method ]
     **
     * Returns or sets the maximum number of concurrent interactions allowed.
     * By default only 1 interaction is allowed at a time (for backwards
     * compatibility). To allow multiple interactions on the same Interactables
     * and elements, you need to enable it in the draggable, resizable and
     * gesturable `'max'` and `'maxPerElement'` options.
     **
     - newValue (number) #optional Any number. newValue <= 0 means no interactions.
    \*/
    interact.maxInteractions = function (newValue) {
        if (isNumber(newValue)) {
            maxInteractions = newValue;

            return this;
        }

        return maxInteractions;
    };

    interact.createSnapGrid = function (grid) {
        return function (x, y) {
            var offsetX = 0,
                offsetY = 0;

            if (isObject(grid.offset)) {
                offsetX = grid.offset.x;
                offsetY = grid.offset.y;
            }

            var gridx = Math.round((x - offsetX) / grid.x),
                gridy = Math.round((y - offsetY) / grid.y),

                newX = gridx * grid.x + offsetX,
                newY = gridy * grid.y + offsetY;

            return {
                x: newX,
                y: newY,
                range: grid.range
            };
        };
    };

    function endAllInteractions (event) {
        for (var i = 0; i < interactions.length; i++) {
            interactions[i].pointerEnd(event, event);
        }
    }

    function listenToDocument (doc) {
        if (contains(documents, doc)) { return; }

        var win = doc.defaultView || doc.parentWindow;

        // add delegate event listener
        for (var eventType in delegatedEvents) {
            events.add(doc, eventType, delegateListener);
            events.add(doc, eventType, delegateUseCapture, true);
        }

        if (PointerEvent) {
            if (PointerEvent === win.MSPointerEvent) {
                pEventTypes = {
                    up: 'MSPointerUp', down: 'MSPointerDown', over: 'mouseover',
                    out: 'mouseout', move: 'MSPointerMove', cancel: 'MSPointerCancel' };
            }
            else {
                pEventTypes = {
                    up: 'pointerup', down: 'pointerdown', over: 'pointerover',
                    out: 'pointerout', move: 'pointermove', cancel: 'pointercancel' };
            }

            events.add(doc, pEventTypes.down  , listeners.selectorDown );
            events.add(doc, pEventTypes.move  , listeners.pointerMove  );
            events.add(doc, pEventTypes.over  , listeners.pointerOver  );
            events.add(doc, pEventTypes.out   , listeners.pointerOut   );
            events.add(doc, pEventTypes.up    , listeners.pointerUp    );
            events.add(doc, pEventTypes.cancel, listeners.pointerCancel);

            // autoscroll
            events.add(doc, pEventTypes.move, autoScroll.edgeMove);
        }
        else {
            events.add(doc, 'mousedown', listeners.selectorDown);
            events.add(doc, 'mousemove', listeners.pointerMove );
            events.add(doc, 'mouseup'  , listeners.pointerUp   );
            events.add(doc, 'mouseover', listeners.pointerOver );
            events.add(doc, 'mouseout' , listeners.pointerOut  );

            events.add(doc, 'touchstart' , listeners.selectorDown );
            events.add(doc, 'touchmove'  , listeners.pointerMove  );
            events.add(doc, 'touchend'   , listeners.pointerUp    );
            events.add(doc, 'touchcancel', listeners.pointerCancel);

            // autoscroll
            events.add(doc, 'mousemove', autoScroll.edgeMove);
            events.add(doc, 'touchmove', autoScroll.edgeMove);
        }

        events.add(win, 'blur', endAllInteractions);

        try {
            if (win.frameElement) {
                var parentDoc = win.frameElement.ownerDocument,
                    parentWindow = parentDoc.defaultView;

                events.add(parentDoc   , 'mouseup'      , listeners.pointerEnd);
                events.add(parentDoc   , 'touchend'     , listeners.pointerEnd);
                events.add(parentDoc   , 'touchcancel'  , listeners.pointerEnd);
                events.add(parentDoc   , 'pointerup'    , listeners.pointerEnd);
                events.add(parentDoc   , 'MSPointerUp'  , listeners.pointerEnd);
                events.add(parentWindow, 'blur'         , endAllInteractions );
            }
        }
        catch (error) {
            interact.windowParentError = error;
        }

        if (events.useAttachEvent) {
            // For IE's lack of Event#preventDefault
            events.add(doc, 'selectstart', function (event) {
                var interaction = interactions[0];

                if (interaction.currentAction()) {
                    interaction.checkAndPreventDefault(event);
                }
            });

            // For IE's bad dblclick event sequence
            events.add(doc, 'dblclick', doOnInteractions('ie8Dblclick'));
        }

        documents.push(doc);
    }

    listenToDocument(document);

    function indexOf (array, target) {
        for (var i = 0, len = array.length; i < len; i++) {
            if (array[i] === target) {
                return i;
            }
        }

        return -1;
    }

    function contains (array, target) {
        return indexOf(array, target) !== -1;
    }

    function matchesSelector (element, selector, nodeList) {
        if (ie8MatchesSelector) {
            return ie8MatchesSelector(element, selector, nodeList);
        }

        // remove /deep/ from selectors if shadowDOM polyfill is used
        if (window !== realWindow) {
            selector = selector.replace(/\/deep\//g, ' ');
        }

        return element[prefixedMatchesSelector](selector);
    }

    function matchesUpTo (element, selector, limit) {
        while (isElement(element)) {
            if (matchesSelector(element, selector)) {
                return true;
            }

            element = parentElement(element);

            if (element === limit) {
                return matchesSelector(element, selector);
            }
        }

        return false;
    }

    // For IE8's lack of an Element#matchesSelector
    // taken from http://tanalin.com/en/blog/2012/12/matches-selector-ie8/ and modified
    if (!(prefixedMatchesSelector in Element.prototype) || !isFunction(Element.prototype[prefixedMatchesSelector])) {
        ie8MatchesSelector = function (element, selector, elems) {
            elems = elems || element.parentNode.querySelectorAll(selector);

            for (var i = 0, len = elems.length; i < len; i++) {
                if (elems[i] === element) {
                    return true;
                }
            }

            return false;
        };
    }

    // requestAnimationFrame polyfill
    (function() {
        var lastTime = 0,
            vendors = ['ms', 'moz', 'webkit', 'o'];

        for(var x = 0; x < vendors.length && !realWindow.requestAnimationFrame; ++x) {
            reqFrame = realWindow[vendors[x]+'RequestAnimationFrame'];
            cancelFrame = realWindow[vendors[x]+'CancelAnimationFrame'] || realWindow[vendors[x]+'CancelRequestAnimationFrame'];
        }

        if (!reqFrame) {
            reqFrame = function(callback) {
                var currTime = new Date().getTime(),
                    timeToCall = Math.max(0, 16 - (currTime - lastTime)),
                    id = setTimeout(function() { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }

        if (!cancelFrame) {
            cancelFrame = function(id) {
                clearTimeout(id);
            };
        }
    }());

    /* global exports: true, module, define */

    // http://documentcloud.github.io/underscore/docs/underscore.html#section-11
    if (typeof exports !== 'undefined') {
        if (typeof module !== 'undefined' && module.exports) {
            exports = module.exports = interact;
        }
        exports.interact = interact;
    }
    // AMD
    else if (typeof define === 'function' && define.amd) {
        define('interact', function() {
            return interact;
        });
    }
    else {
        realWindow.interact = interact;
    }

} (window));

},{}],2:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

require('templates');
require('interact.js');

var app = angular.module('BuildingBlox.Directives', ['BuildingBlox.Directives.Templates', require('./helpers')])
    .provider('BuildingBloxDirectives', function () {
        'use strict';
        var baseOptions = {
                bootstrap: false
            },
            getValue = function (options, name) {
                return options.hasOwnProperty(name) ? options[name] : baseOptions[name];
            },
            setValue = function (options, name) {
                baseOptions[name] = getValue(options, name);
            };

        function BuildingBloxDirectivesOptions(options) {
            this.bootstrap = options.bootstrap;
        }

        this.init = function (options) {
            setValue(options, 'bootstrap');
        };

        this.$get = [function () {
            return new BuildingBloxDirectivesOptions(baseOptions);
        }];
    });

var exports = app;
module.exports = app;

require('./directives/abbList.js');
require('./directives/dragArea.js');
require('./directives/draggable.js');
require('./directives/draggableList.js');
require('./directives/droparea.js');
require('./directives/hiddenInput.js');
require('./directives/listItem.js');
},{"./directives/abbList.js":3,"./directives/dragArea.js":4,"./directives/draggable.js":5,"./directives/draggableList.js":6,"./directives/droparea.js":7,"./directives/hiddenInput.js":8,"./directives/listItem.js":9,"./helpers":13,"interact.js":1,"templates":"OSVe9F"}],3:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('abbList', ['abbGenerators', 'abbArrayHelpers', function (generators, arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/abbList.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@',
            idProperty: '@',
            listNameProperty: '@',
            listProperty: '@'
        },
        controller: ['$scope', function ($scope) {
            var getIdProperty = function () { return $scope.idProperty || '_id'; },
                getDisplayProperty = function () { return $scope.displayProperty || 'value'; },
                getListNameProperty = function () { return $scope.listNameProperty || 'name'; },
                getListProperty = function () { return $scope.listProperty || 'list'; },
                getList = function () { return $scope.model[getListProperty()]; },
                newItem;

            $scope.getIdProperty = getIdProperty;
            $scope.getDisplayProperty = getDisplayProperty;
            $scope.getListNameProperty = getListNameProperty;
            $scope.getList = getList;
            if (!$scope.model) {
                return;
            }
            arrayHelpers.each(getList(), function (item, index) {
                if (typeof item !== 'object') {
                    newItem = {};
                    newItem[getDisplayProperty()] = item;
                    item = newItem;
                    getList().splice(index, 1, item);
                }
                item[getIdProperty()] = item[getIdProperty()] || generators.guid();
            });
            $scope.model[getListNameProperty()] = $scope.model[getListNameProperty()] || 'Untitled';
        }]
    };
}]);
},{"../buildingBlox.directives.js":2}],4:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = require('interact.js');
var app = require('../buildingBlox.directives.js');
app.directive('dragArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            remove: '='
        },
        controller: ['$scope', function ($scope) {
            this.remove = $scope.remove;
        }]
    };
}]);
},{"../buildingBlox.directives.js":2,"interact.js":1}],5:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = require('interact.js');
var app = require('../buildingBlox.directives.js');
app.directive('draggable', [function () {
    'use strict';
    return {
        restrict: 'C',
        require: '^dragArea',
        link: function (scope, element, attrs, dragAreaController) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.draggable({
                onmove: function (event) {
                    var target = event.target,
                        x = (parseInt(target.getAttribute('data-x'), 10) || 0) + event.dx,
                        y = (parseInt(target.getAttribute('data-y'), 10) || 0) + event.dy;
                    element.css({
                        'transition': '',
                        'z-index': 1000,
                        'transform': 'translate(' + x + 'px, ' + y + 'px)'
                    });
                    element.attr('data-x', x);
                    element.attr('data-y', y);
                    element.addClass('transparent');
                },
                onend: function () {
                    element.css({
                        'z-index': 0,
                        'transform': ''
                    });
                    element.attr('data-x', 0);
                    element.attr('data-y', 0);
                    element.removeClass('transparent');
                }
            });
            interactible.getItem = function () {
                if (scope.item && scope.getIdProperty) {
                    return scope.item;
                }
                return null;
            };
            interactible.remove = function () {
                if (scope.item && scope.getIdProperty && dragAreaController.remove) {
                    dragAreaController.remove(scope.item[scope.getIdProperty()]);
                }
            };
        }
    };
}]);
},{"../buildingBlox.directives.js":2,"interact.js":1}],6:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('draggableList', ['abbGenerators', 'abbArrayHelpers', function (generators, arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/draggableList.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@',
            idProperty: '@',
            listNameProperty: '@',
            listProperty: '@'
        },
        controller: ['$scope', function ($scope) {
            var getIdProperty = function () { return $scope.idProperty || '_id'; },
                getDisplayProperty = function () { return $scope.displayProperty || 'value'; },
                getListNameProperty = function () { return $scope.listNameProperty || 'name'; },
                getListProperty = function () { return $scope.listProperty || 'list'; },
                getList = function () { return $scope.model[getListProperty()]; },
                getIndexOfId = function (id, defaultValue) {
                    return arrayHelpers.firstReturn(getList(), function (item, index) {
                        if (item[getIdProperty()] === id) {
                            return index;
                        }
                    }, defaultValue);
                },
                addBeforeList = {},
                newItem;

            $scope.getIdProperty = getIdProperty;
            $scope.getDisplayProperty = getDisplayProperty;
            $scope.getListNameProperty = getListNameProperty;
            $scope.getList = getList;
            $scope.addToList = function (ev) {
                newItem = ev.draggable.getItem();
                if (getList().indexOf(newItem) >= 0) {
                    return;
                }
                ev.draggable.remove();
                if (newItem) {
                    getList().push(newItem);
                }
                addBeforeList = {};
            };
            if (!$scope.model) {
                return;
            }
            arrayHelpers.each(getList(), function (item, index) {
                if (typeof item !== 'object') {
                    newItem = {};
                    newItem[getDisplayProperty()] = item;
                    item = newItem;
                    getList().splice(index, 1, item);
                }
                item[getIdProperty()] = item[getIdProperty()] || generators.guid();
            });
            $scope.model[getListNameProperty()] = $scope.model[getListNameProperty()] || 'Untitled';

            $scope.removeById = function (id) {
                var defaultValue = -1,
                    removeIndex;
                removeIndex = getIndexOfId(id, defaultValue);
                if (removeIndex !== defaultValue) {
                    if (getList().splice) {
                        getList().splice(removeIndex, 1);
                    } else {
                        delete getList()[removeIndex];
                    }
                }
                addBeforeList = {};
            };

            $scope.createAddBefore = function (id) {
                var defaultValue = -1,
                    idIndex;
                if (!addBeforeList['_id_' + id]) {
                    idIndex = getIndexOfId(id, defaultValue);
                    addBeforeList['_id_' + id] = function (ev) {
                        newItem = ev.draggable.getItem();
                        ev.draggable.remove();
                        getList().splice(idIndex, 0, newItem);
                        addBeforeList = {};
                    };
                }
                return addBeforeList['_id_' + id];
            };
        }]
    };
}]);
},{"../buildingBlox.directives.js":2}],7:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var interact = require('interact.js');
var app = require('../buildingBlox.directives.js');
app.directive('dropArea', [function () {
    'use strict';
    return {
        restrict: 'C',
        scope: {
            onDrop: '=',
            onDragEnter: '=',
            onDragLeave: '='
        },
        link: function (scope, element) {
            var htmlElement = element[0],
                interactible;
            interactible = interact(htmlElement);
            interactible.dropzone({
                accept: '.draggable',
                overlap: 'pointer',
                ondragenter: function () {
                    if (!scope.onDragEnter) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragEnter.apply(scope, args);
                    });
                },
                ondragleave: function () {
                    if (!scope.onDragLeave) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDragLeave.apply(scope, args);
                    });
                },
                ondrop:  function () {
                    if (!scope.onDrop) {
                        return;
                    }
                    var args = arguments;
                    scope.$apply(function () {
                        scope.onDrop.apply(scope, args);
                    });
                }
            });
        }
    };
}]);
},{"../buildingBlox.directives.js":2,"interact.js":1}],8:[function(require,module,exports){
/*global angular, require, module, interact*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('hiddenInput', ['abbArrayHelpers', function (arrayHelpers) {
    'use strict';
    return {
        restrict: 'E',
        template: '<input />',
        replace: true,
        scope: {
        },
        link: function (scope, element) {
            var inputElement = element.find('input'),
                parentAttributes = element[0].attributes;

            arrayHelpers.each(parentAttributes, function (attributeNode) {
                if (attributeNode.value) {
                    inputElement.attr(attributeNode.nodeName, attributeNode.value);
                }
            });

            inputElement.addClass('hiddenInput');
        }
    };
}]);
},{"../buildingBlox.directives.js":2}],9:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var app = require('../buildingBlox.directives.js');
app.directive('listItem', [function () {
    'use strict';
    return {
        restrict: 'E',
        templateUrl: 'src/templates/listItem.html',
        scope: {
            model: '=ngModel',
            displayProperty: '@'
        },
        controller: ['$scope', '$element', function ($scope, $element) {
            $scope.getValue = function () { return $scope.model[$scope.displayProperty || 'value']; };
        }]
    };
}]);
},{"../buildingBlox.directives.js":2}],10:[function(require,module,exports){
module.exports=require(2)
},{"./directives/abbList.js":3,"./directives/dragArea.js":4,"./directives/draggable.js":5,"./directives/draggableList.js":6,"./directives/droparea.js":7,"./directives/hiddenInput.js":8,"./directives/listItem.js":9,"./helpers":13,"interact.js":1,"templates":"OSVe9F"}],11:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var defaultReturnValue = -Infinity;

function arrayCallHelper(func, arr, i, obj) {
    'use strict';
    obj = obj || arr[i];
    return func.call(obj, obj, i, arr);
}

function getDefaultValue(defaultValue) {
    'use strict';
    return defaultValue === undefined ? defaultReturnValue : defaultValue;
}

/* -------------------------------------------------------------------- */

function each(arr, func) {
    'use strict';
    var i;
    for (i in arr) {
        if (arr.hasOwnProperty(i)) {
            arrayCallHelper(func, arr, i);
        }
    }
}

function firstReturn(arr, func) {
    'use strict';
    var i, val;
    for (i in arr) {
        if (arr.hasOwnProperty(i)) {
            val = arrayCallHelper(func, arr, i);
            if (val !== undefined) {
                return val;
            }
        }
    }
}

function all(arr, func) {
    'use strict';
    var val;
    val = firstReturn(arr, function (obj, i) {
        val = arrayCallHelper(func, arr, i);
        if (!val) {
            return false;
        }
    });

    return val || false;
}

function any(arr, func) {
    'use strict';
    var val;
    val = firstReturn(arr, function (obj, i) {
        val = arrayCallHelper(func, arr, i);
        if (val) {
            return true;
        }
    });

    return val || false;
}

function where(arr, func) {
    'use strict';
    var out = [];
    each(arr, function (obj, i) {
        if (arrayCallHelper(func, arr, i)) {
            out.push(obj);
        }
    });
    return out;
}

function single(arr, func, defaultValue) {
    'use strict';
    var out, outIsSet;
    defaultValue = getDefaultValue(defaultValue);
    if (typeof func === "function") {
        out = defaultValue;
        outIsSet = true;
        each(arr, function (obj, i) {
            if (arrayCallHelper(func, arr, i)) {
                if (outIsSet) {
                    return defaultValue;
                }
                outIsSet = true;
                out = obj;
            }
        });
        return out;
    }

    if (arr.length !== 1) {
        return getDefaultValue(defaultValue);
    }
    return arr[0];
}

function first(arr, func, defaultValue) {
    'use strict';

    if (arr.length < 1) {
        return getDefaultValue(defaultValue);
    }

    if (typeof func === "function") {
        each(arr, function (obj, i) {
            if (arrayCallHelper(func, arr, i)) {
                return obj;
            }
        });
        return getDefaultValue(defaultValue);
    }

    return arr[0];
}

var arrayHelpers = {
    each: each,
    firstReturn: firstReturn,
    all: all,
    any: any,
    where: where,
    single: single,
    first: first
};

Object.freeze(arrayHelpers);

module.exports = arrayHelpers;
},{}],12:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

function randHex() {
    'use strict';
    var rand = Math.random();
    rand = parseInt(rand * 16, 10);
    return rand.toString(16);
}

function guid() {
    'use strict';
    var i,
        output = '';

    for (i = 0; i < 8; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 4; i++) {
        output += randHex();
    }
    output += '-4';
    for (i = 0; i < 3; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 4; i++) {
        output += randHex();
    }
    output += '-';
    for (i = 0; i < 12; i++) {
        output += randHex();
    }

    return output;
}

var generators = {
    randHex: randHex,
    guid: guid
};

Object.freeze(generators);

module.exports = generators;
},{}],13:[function(require,module,exports){
/*global angular, require, module*/
/*jslint browser: true*/

var moduleName = 'ABB.Helpers';

var app = angular.module(moduleName, []);

app.value('abbArrayHelpers', require('./arrayHelpers.js'));
app.value('abbGenerators', require('./generators.js'));

module.exports = moduleName;
},{"./arrayHelpers.js":11,"./generators.js":12}],"templates":[function(require,module,exports){
module.exports=require('OSVe9F');
},{}],"OSVe9F":[function(require,module,exports){
(function (global){
(function browserifyShim(module, define) {
(function(module) {
try { module = angular.module("BuildingBlox.Directives.Templates"); }
catch(err) { module = angular.module("BuildingBlox.Directives.Templates", []); }
module.run(["$templateCache", function($templateCache) {
  $templateCache.put("src/templates/abbList.html",
    "<div class=\"panel panel-primary\">\n" +
    "    <div class=\"panel-heading\"><input class=\"hidden-input\" ng-model=\"model[getListNameProperty()]\" /></div>\n" +
    "    <div class=\"list-group-item\" ng-repeat=\"(index, item) in getList() track by item[getIdProperty()]\" ng-if=\"index != getListNameProperty()\">\n" +
    "        <list-item ng-model=\"item\" display-property=\"{{getDisplayProperty()}}\"></list-item>\n" +
    "    </div>\n" +
    "</div>");
}]);
})();

(function(module) {
try { module = angular.module("BuildingBlox.Directives.Templates"); }
catch(err) { module = angular.module("BuildingBlox.Directives.Templates", []); }
module.run(["$templateCache", function($templateCache) {
  $templateCache.put("src/templates/draggableList.html",
    "<div class=\"dragArea\" remove=\"removeById\">\n" +
    "    <div class=\"panel panel-primary dropArea\" on-drop=\"addToList\">\n" +
    "        <div class=\"panel-heading\"><input class=\"hidden-input\" ng-model=\"model[getListNameProperty()]\" /></div>\n" +
    "        <div class=\"list-group-item dropArea draggable\" on-drop=\"createAddBefore(item[getIdProperty()])\" ng-repeat=\"(index, item) in getList() track by item[getIdProperty()]\" ng-if=\"index != getListNameProperty()\">\n" +
    "            <list-item ng-model=\"item\" display-property=\"{{getDisplayProperty()}}\"></list-item>\n" +
    "        </div>\n" +
    "    </div>\n" +
    "</div>");
}]);
})();

(function(module) {
try { module = angular.module("BuildingBlox.Directives.Templates"); }
catch(err) { module = angular.module("BuildingBlox.Directives.Templates", []); }
module.run(["$templateCache", function($templateCache) {
  $templateCache.put("src/templates/listItem.html",
    "<div>{{getValue()}}</div>");
}]);
})();

}).call(global, module, undefined);

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}]},{},[10])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkM6XFxEZXZcXEJ1aWxkaW5nQmxveFxcbm9kZV9tb2R1bGVzXFxndWxwLWJyb3dzZXJpZnlcXG5vZGVfbW9kdWxlc1xcYnJvd3NlcmlmeVxcbm9kZV9tb2R1bGVzXFxicm93c2VyLXBhY2tcXF9wcmVsdWRlLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9ub2RlX21vZHVsZXMvaW50ZXJhY3QuanMvaW50ZXJhY3QuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9idWlsZGluZ0Jsb3guZGlyZWN0aXZlcy5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2RpcmVjdGl2ZXMvYWJiTGlzdC5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2RpcmVjdGl2ZXMvZHJhZ0FyZWEuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9kaXJlY3RpdmVzL2RyYWdnYWJsZS5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2RpcmVjdGl2ZXMvZHJhZ2dhYmxlTGlzdC5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2RpcmVjdGl2ZXMvZHJvcGFyZWEuanMiLCJDOi9EZXYvQnVpbGRpbmdCbG94L3NyYy9kaXJlY3RpdmVzL2hpZGRlbklucHV0LmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvZGlyZWN0aXZlcy9saXN0SXRlbS5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL2hlbHBlcnMvYXJyYXlIZWxwZXJzLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvaGVscGVycy9nZW5lcmF0b3JzLmpzIiwiQzovRGV2L0J1aWxkaW5nQmxveC9zcmMvaGVscGVycy9pbmRleC5qcyIsIkM6L0Rldi9CdWlsZGluZ0Jsb3gvc3JjL3RtcC90ZW1wbGF0ZXMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdnNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNWQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8qKlxuICogaW50ZXJhY3QuanMgdjEuMi40XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDEyLTIwMTUgVGF5ZSBBZGV5ZW1pIDxkZXZAdGF5ZS5tZT5cbiAqIE9wZW4gc291cmNlIHVuZGVyIHRoZSBNSVQgTGljZW5zZS5cbiAqIGh0dHBzOi8vcmF3LmdpdGh1Yi5jb20vdGF5ZS9pbnRlcmFjdC5qcy9tYXN0ZXIvTElDRU5TRVxuICovXG4oZnVuY3Rpb24gKHJlYWxXaW5kb3cpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICB2YXIgLy8gZ2V0IHdyYXBwZWQgd2luZG93IGlmIHVzaW5nIFNoYWRvdyBET00gcG9seWZpbGxcbiAgICAgICAgd2luZG93ID0gKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIFRleHROb2RlXG4gICAgICAgICAgICB2YXIgZWwgPSByZWFsV2luZG93LmRvY3VtZW50LmNyZWF0ZVRleHROb2RlKCcnKTtcblxuICAgICAgICAgICAgLy8gY2hlY2sgaWYgaXQncyB3cmFwcGVkIGJ5IGEgcG9seWZpbGxcbiAgICAgICAgICAgIGlmIChlbC5vd25lckRvY3VtZW50ICE9PSByZWFsV2luZG93LmRvY3VtZW50XG4gICAgICAgICAgICAgICAgJiYgdHlwZW9mIHJlYWxXaW5kb3cud3JhcCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgICAgICAgICAgICYmIHJlYWxXaW5kb3cud3JhcChlbCkgPT09IGVsKSB7XG4gICAgICAgICAgICAgICAgLy8gcmV0dXJuIHdyYXBwZWQgd2luZG93XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYWxXaW5kb3cud3JhcChyZWFsV2luZG93KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gbm8gU2hhZG93IERPTSBwb2x5ZmlsIG9yIG5hdGl2ZSBpbXBsZW1lbnRhdGlvblxuICAgICAgICAgICAgcmV0dXJuIHJlYWxXaW5kb3c7XG4gICAgICAgIH0oKSksXG5cbiAgICAgICAgZG9jdW1lbnQgICAgICAgICAgID0gd2luZG93LmRvY3VtZW50LFxuICAgICAgICBEb2N1bWVudEZyYWdtZW50ICAgPSB3aW5kb3cuRG9jdW1lbnRGcmFnbWVudCAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdFbGVtZW50ICAgICAgICAgPSB3aW5kb3cuU1ZHRWxlbWVudCAgICAgICAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdTVkdFbGVtZW50ICAgICAgPSB3aW5kb3cuU1ZHU1ZHRWxlbWVudCAgICAgIHx8IGJsYW5rLFxuICAgICAgICBTVkdFbGVtZW50SW5zdGFuY2UgPSB3aW5kb3cuU1ZHRWxlbWVudEluc3RhbmNlIHx8IGJsYW5rLFxuICAgICAgICBIVE1MRWxlbWVudCAgICAgICAgPSB3aW5kb3cuSFRNTEVsZW1lbnQgICAgICAgIHx8IHdpbmRvdy5FbGVtZW50LFxuXG4gICAgICAgIFBvaW50ZXJFdmVudCA9ICh3aW5kb3cuUG9pbnRlckV2ZW50IHx8IHdpbmRvdy5NU1BvaW50ZXJFdmVudCksXG4gICAgICAgIHBFdmVudFR5cGVzLFxuXG4gICAgICAgIGh5cG90ID0gTWF0aC5oeXBvdCB8fCBmdW5jdGlvbiAoeCwgeSkgeyByZXR1cm4gTWF0aC5zcXJ0KHggKiB4ICsgeSAqIHkpOyB9LFxuXG4gICAgICAgIHRtcFhZID0ge30sICAgICAvLyByZWR1Y2Ugb2JqZWN0IGNyZWF0aW9uIGluIGdldFhZKClcblxuICAgICAgICBkb2N1bWVudHMgICAgICAgPSBbXSwgICAvLyBhbGwgZG9jdW1lbnRzIGJlaW5nIGxpc3RlbmVkIHRvXG5cbiAgICAgICAgaW50ZXJhY3RhYmxlcyAgID0gW10sICAgLy8gYWxsIHNldCBpbnRlcmFjdGFibGVzXG4gICAgICAgIGludGVyYWN0aW9ucyAgICA9IFtdLCAgIC8vIGFsbCBpbnRlcmFjdGlvbnNcblxuICAgICAgICBkeW5hbWljRHJvcCAgICAgPSBmYWxzZSxcblxuICAgICAgICAvLyB7XG4gICAgICAgIC8vICAgICAgdHlwZToge1xuICAgICAgICAvLyAgICAgICAgICBzZWxlY3RvcnM6IFsnc2VsZWN0b3InLCAuLi5dLFxuICAgICAgICAvLyAgICAgICAgICBjb250ZXh0cyA6IFtkb2N1bWVudCwgLi4uXSxcbiAgICAgICAgLy8gICAgICAgICAgbGlzdGVuZXJzOiBbW2xpc3RlbmVyLCB1c2VDYXB0dXJlXSwgLi4uXVxuICAgICAgICAvLyAgICAgIH1cbiAgICAgICAgLy8gIH1cbiAgICAgICAgZGVsZWdhdGVkRXZlbnRzID0ge30sXG5cbiAgICAgICAgZGVmYXVsdE9wdGlvbnMgPSB7XG4gICAgICAgICAgICBiYXNlOiB7XG4gICAgICAgICAgICAgICAgYWNjZXB0ICAgICAgICA6IG51bGwsXG4gICAgICAgICAgICAgICAgYWN0aW9uQ2hlY2tlciA6IG51bGwsXG4gICAgICAgICAgICAgICAgc3R5bGVDdXJzb3IgICA6IHRydWUsXG4gICAgICAgICAgICAgICAgcHJldmVudERlZmF1bHQ6ICdhdXRvJyxcbiAgICAgICAgICAgICAgICBvcmlnaW4gICAgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICAgICAgZGVsdGFTb3VyY2UgICA6ICdwYWdlJyxcbiAgICAgICAgICAgICAgICBhbGxvd0Zyb20gICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBpZ25vcmVGcm9tICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBfY29udGV4dCAgICAgIDogZG9jdW1lbnQsXG4gICAgICAgICAgICAgICAgZHJvcENoZWNrZXIgICA6IG51bGxcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGRyYWc6IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogdHJ1ZSxcbiAgICAgICAgICAgICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgIG1heFBlckVsZW1lbnQ6IDEsXG5cbiAgICAgICAgICAgICAgICBzbmFwOiBudWxsLFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiBudWxsLFxuICAgICAgICAgICAgICAgIGluZXJ0aWE6IG51bGwsXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbDogbnVsbCxcblxuICAgICAgICAgICAgICAgIGF4aXM6ICd4eScsXG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBkcm9wOiB7XG4gICAgICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgYWNjZXB0OiBudWxsLFxuICAgICAgICAgICAgICAgIG92ZXJsYXA6ICdwb2ludGVyJ1xuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgcmVzaXplOiB7XG4gICAgICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWFudWFsU3RhcnQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICAgICAgICAgbWF4UGVyRWxlbWVudDogMSxcblxuICAgICAgICAgICAgICAgIHNuYXA6IG51bGwsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Q6IG51bGwsXG4gICAgICAgICAgICAgICAgaW5lcnRpYTogbnVsbCxcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgc3F1YXJlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBheGlzOiAneHknLFxuXG4gICAgICAgICAgICAgICAgLy8gb2JqZWN0IHdpdGggcHJvcHMgbGVmdCwgcmlnaHQsIHRvcCwgYm90dG9tIHdoaWNoIGFyZVxuICAgICAgICAgICAgICAgIC8vIHRydWUvZmFsc2UgdmFsdWVzIHRvIHJlc2l6ZSB3aGVuIHRoZSBwb2ludGVyIGlzIG92ZXIgdGhhdCBlZGdlLFxuICAgICAgICAgICAgICAgIC8vIENTUyBzZWxlY3RvcnMgdG8gbWF0Y2ggdGhlIGhhbmRsZXMgZm9yIGVhY2ggZGlyZWN0aW9uXG4gICAgICAgICAgICAgICAgLy8gb3IgdGhlIEVsZW1lbnRzIGZvciBlYWNoIGhhbmRsZVxuICAgICAgICAgICAgICAgIGVkZ2VzOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgLy8gYSB2YWx1ZSBvZiAnbm9uZScgd2lsbCBsaW1pdCB0aGUgcmVzaXplIHJlY3QgdG8gYSBtaW5pbXVtIG9mIDB4MFxuICAgICAgICAgICAgICAgIC8vICduZWdhdGUnIHdpbGwgYWxvdyB0aGUgcmVjdCB0byBoYXZlIG5lZ2F0aXZlIHdpZHRoL2hlaWdodFxuICAgICAgICAgICAgICAgIC8vICdyZXBvc2l0aW9uJyB3aWxsIGtlZXAgdGhlIHdpZHRoL2hlaWdodCBwb3NpdGl2ZSBieSBzd2FwcGluZ1xuICAgICAgICAgICAgICAgIC8vIHRoZSB0b3AgYW5kIGJvdHRvbSBlZGdlcyBhbmQvb3Igc3dhcHBpbmcgdGhlIGxlZnQgYW5kIHJpZ2h0IGVkZ2VzXG4gICAgICAgICAgICAgICAgaW52ZXJ0OiAnbm9uZSdcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIGdlc3R1cmU6IHtcbiAgICAgICAgICAgICAgICBtYW51YWxTdGFydDogZmFsc2UsXG4gICAgICAgICAgICAgICAgZW5hYmxlZDogZmFsc2UsXG4gICAgICAgICAgICAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgICAgICAgICBtYXhQZXJFbGVtZW50OiAxLFxuXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Q6IG51bGxcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHBlckFjdGlvbjoge1xuICAgICAgICAgICAgICAgIG1hbnVhbFN0YXJ0OiBmYWxzZSxcbiAgICAgICAgICAgICAgICBtYXg6IEluZmluaXR5LFxuICAgICAgICAgICAgICAgIG1heFBlckVsZW1lbnQ6IDEsXG5cbiAgICAgICAgICAgICAgICBzbmFwOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGVuZE9ubHkgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlICAgICAgIDogSW5maW5pdHksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgb2Zmc2V0cyAgICAgOiBudWxsLFxuXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0aXZlUG9pbnRzOiBudWxsXG4gICAgICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgICAgIHJlc3RyaWN0OiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBlbmRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgIDogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lciAgIDogbnVsbCwgICAgIC8vIHRoZSBpdGVtIHRoYXQgaXMgc2Nyb2xsZWQgKFdpbmRvdyBvciBIVE1MRWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgbWFyZ2luICAgICAgOiA2MCxcbiAgICAgICAgICAgICAgICAgICAgc3BlZWQgICAgICAgOiAzMDAgICAgICAgLy8gdGhlIHNjcm9sbCBzcGVlZCBpbiBwaXhlbHMgcGVyIHNlY29uZFxuICAgICAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgICAgICBpbmVydGlhOiB7XG4gICAgICAgICAgICAgICAgICAgIGVuYWJsZWQgICAgICAgICAgOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgcmVzaXN0YW5jZSAgICAgICA6IDEwLCAgICAvLyB0aGUgbGFtYmRhIGluIGV4cG9uZW50aWFsIGRlY2F5XG4gICAgICAgICAgICAgICAgICAgIG1pblNwZWVkICAgICAgICAgOiAxMDAsICAgLy8gdGFyZ2V0IHNwZWVkIG11c3QgYmUgYWJvdmUgdGhpcyBmb3IgaW5lcnRpYSB0byBzdGFydFxuICAgICAgICAgICAgICAgICAgICBlbmRTcGVlZCAgICAgICAgIDogMTAsICAgIC8vIHRoZSBzcGVlZCBhdCB3aGljaCBpbmVydGlhIGlzIHNsb3cgZW5vdWdoIHRvIHN0b3BcbiAgICAgICAgICAgICAgICAgICAgYWxsb3dSZXN1bWUgICAgICA6IHRydWUsICAvLyBhbGxvdyByZXN1bWluZyBhbiBhY3Rpb24gaW4gaW5lcnRpYSBwaGFzZVxuICAgICAgICAgICAgICAgICAgICB6ZXJvUmVzdW1lRGVsdGEgIDogdHJ1ZSwgIC8vIGlmIGFuIGFjdGlvbiBpcyByZXN1bWVkIGFmdGVyIGxhdW5jaCwgc2V0IGR4L2R5IHRvIDBcbiAgICAgICAgICAgICAgICAgICAgc21vb3RoRW5kRHVyYXRpb246IDMwMCAgICAvLyBhbmltYXRlIHRvIHNuYXAvcmVzdHJpY3QgZW5kT25seSBpZiB0aGVyZSdzIG5vIGluZXJ0aWFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBfaG9sZER1cmF0aW9uOiA2MDBcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBUaGluZ3MgcmVsYXRlZCB0byBhdXRvU2Nyb2xsXG4gICAgICAgIGF1dG9TY3JvbGwgPSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbjogbnVsbCxcbiAgICAgICAgICAgIGk6IG51bGwsICAgIC8vIHRoZSBoYW5kbGUgcmV0dXJuZWQgYnkgd2luZG93LnNldEludGVydmFsXG4gICAgICAgICAgICB4OiAwLCB5OiAwLCAvLyBEaXJlY3Rpb24gZWFjaCBwdWxzZSBpcyB0byBzY3JvbGwgaW5cblxuICAgICAgICAgICAgLy8gc2Nyb2xsIHRoZSB3aW5kb3cgYnkgdGhlIHZhbHVlcyBpbiBzY3JvbGwueC95XG4gICAgICAgICAgICBzY3JvbGw6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgb3B0aW9ucyA9IGF1dG9TY3JvbGwuaW50ZXJhY3Rpb24udGFyZ2V0Lm9wdGlvbnNbYXV0b1Njcm9sbC5pbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lXS5hdXRvU2Nyb2xsLFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lciB8fCBnZXRXaW5kb3coYXV0b1Njcm9sbC5pbnRlcmFjdGlvbi5lbGVtZW50KSxcbiAgICAgICAgICAgICAgICAgICAgbm93ID0gbmV3IERhdGUoKS5nZXRUaW1lKCksXG4gICAgICAgICAgICAgICAgICAgIC8vIGNoYW5nZSBpbiB0aW1lIGluIHNlY29uZHNcbiAgICAgICAgICAgICAgICAgICAgZHQgPSAobm93IC0gYXV0b1Njcm9sbC5wcmV2VGltZSkgLyAxMDAwLFxuICAgICAgICAgICAgICAgICAgICAvLyBkaXNwbGFjZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgcyA9IG9wdGlvbnMuc3BlZWQgKiBkdDtcblxuICAgICAgICAgICAgICAgIGlmIChzID49IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzV2luZG93KGNvbnRhaW5lcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxCeShhdXRvU2Nyb2xsLnggKiBzLCBhdXRvU2Nyb2xsLnkgKiBzKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIGlmIChjb250YWluZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lci5zY3JvbGxMZWZ0ICs9IGF1dG9TY3JvbGwueCAqIHM7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250YWluZXIuc2Nyb2xsVG9wICArPSBhdXRvU2Nyb2xsLnkgKiBzO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5wcmV2VGltZSA9IG5vdztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoYXV0b1Njcm9sbC5pc1Njcm9sbGluZykge1xuICAgICAgICAgICAgICAgICAgICBjYW5jZWxGcmFtZShhdXRvU2Nyb2xsLmkpO1xuICAgICAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmkgPSByZXFGcmFtZShhdXRvU2Nyb2xsLnNjcm9sbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcblxuICAgICAgICAgICAgZWRnZU1vdmU6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBpbnRlcmFjdGlvbixcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkb0F1dG9zY3JvbGwgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgaW50ZXJhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zW2ldO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5pbnRlcmFjdGluZygpXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiBjaGVja0F1dG9TY3JvbGwoaW50ZXJhY3Rpb24udGFyZ2V0LCBpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lKSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBpbnRlcmFjdGlvbi50YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBkb0F1dG9zY3JvbGwgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIWRvQXV0b3Njcm9sbCkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIHZhciB0b3AsXG4gICAgICAgICAgICAgICAgICAgIHJpZ2h0LFxuICAgICAgICAgICAgICAgICAgICBib3R0b20sXG4gICAgICAgICAgICAgICAgICAgIGxlZnQsXG4gICAgICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB0YXJnZXQub3B0aW9uc1tpbnRlcmFjdGlvbi5wcmVwYXJlZC5uYW1lXS5hdXRvU2Nyb2xsLFxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lciB8fCBnZXRXaW5kb3coaW50ZXJhY3Rpb24uZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaXNXaW5kb3coY29udGFpbmVyKSkge1xuICAgICAgICAgICAgICAgICAgICBsZWZ0ICAgPSBldmVudC5jbGllbnRYIDwgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgICAgIHRvcCAgICA9IGV2ZW50LmNsaWVudFkgPCBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQgID0gZXZlbnQuY2xpZW50WCA+IGNvbnRhaW5lci5pbm5lcldpZHRoICAtIGF1dG9TY3JvbGwubWFyZ2luO1xuICAgICAgICAgICAgICAgICAgICBib3R0b20gPSBldmVudC5jbGllbnRZID4gY29udGFpbmVyLmlubmVySGVpZ2h0IC0gYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmVjdCA9IGdldEVsZW1lbnRSZWN0KGNvbnRhaW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgbGVmdCAgID0gZXZlbnQuY2xpZW50WCA8IHJlY3QubGVmdCAgICsgYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgICAgIHRvcCAgICA9IGV2ZW50LmNsaWVudFkgPCByZWN0LnRvcCAgICArIGF1dG9TY3JvbGwubWFyZ2luO1xuICAgICAgICAgICAgICAgICAgICByaWdodCAgPSBldmVudC5jbGllbnRYID4gcmVjdC5yaWdodCAgLSBhdXRvU2Nyb2xsLm1hcmdpbjtcbiAgICAgICAgICAgICAgICAgICAgYm90dG9tID0gZXZlbnQuY2xpZW50WSA+IHJlY3QuYm90dG9tIC0gYXV0b1Njcm9sbC5tYXJnaW47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC54ID0gKHJpZ2h0ID8gMTogbGVmdD8gLTE6IDApO1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwueSA9IChib3R0b20/IDE6ICB0b3A/IC0xOiAwKTtcblxuICAgICAgICAgICAgICAgIGlmICghYXV0b1Njcm9sbC5pc1Njcm9sbGluZykge1xuICAgICAgICAgICAgICAgICAgICAvLyBzZXQgdGhlIGF1dG9TY3JvbGwgcHJvcGVydGllcyB0byB0aG9zZSBvZiB0aGUgdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwubWFyZ2luID0gb3B0aW9ucy5tYXJnaW47XG4gICAgICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuc3BlZWQgID0gb3B0aW9ucy5zcGVlZDtcblxuICAgICAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLnN0YXJ0KGludGVyYWN0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LFxuXG4gICAgICAgICAgICBpc1Njcm9sbGluZzogZmFsc2UsXG4gICAgICAgICAgICBwcmV2VGltZTogMCxcblxuICAgICAgICAgICAgc3RhcnQ6IGZ1bmN0aW9uIChpbnRlcmFjdGlvbikge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuaXNTY3JvbGxpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNhbmNlbEZyYW1lKGF1dG9TY3JvbGwuaSk7XG5cbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmludGVyYWN0aW9uID0gaW50ZXJhY3Rpb247XG4gICAgICAgICAgICAgICAgYXV0b1Njcm9sbC5wcmV2VGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuaSA9IHJlcUZyYW1lKGF1dG9TY3JvbGwuc2Nyb2xsKTtcbiAgICAgICAgICAgIH0sXG5cbiAgICAgICAgICAgIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBhdXRvU2Nyb2xsLmlzU2Nyb2xsaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgY2FuY2VsRnJhbWUoYXV0b1Njcm9sbC5pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBEb2VzIHRoZSBicm93c2VyIHN1cHBvcnQgdG91Y2ggaW5wdXQ/XG4gICAgICAgIHN1cHBvcnRzVG91Y2ggPSAoKCdvbnRvdWNoc3RhcnQnIGluIHdpbmRvdykgfHwgd2luZG93LkRvY3VtZW50VG91Y2ggJiYgZG9jdW1lbnQgaW5zdGFuY2VvZiB3aW5kb3cuRG9jdW1lbnRUb3VjaCksXG5cbiAgICAgICAgLy8gRG9lcyB0aGUgYnJvd3NlciBzdXBwb3J0IFBvaW50ZXJFdmVudHNcbiAgICAgICAgc3VwcG9ydHNQb2ludGVyRXZlbnQgPSAhIVBvaW50ZXJFdmVudCxcblxuICAgICAgICAvLyBMZXNzIFByZWNpc2lvbiB3aXRoIHRvdWNoIGlucHV0XG4gICAgICAgIG1hcmdpbiA9IHN1cHBvcnRzVG91Y2ggfHwgc3VwcG9ydHNQb2ludGVyRXZlbnQ/IDIwOiAxMCxcblxuICAgICAgICBwb2ludGVyTW92ZVRvbGVyYW5jZSA9IDEsXG5cbiAgICAgICAgLy8gZm9yIGlnbm9yaW5nIGJyb3dzZXIncyBzaW11bGF0ZWQgbW91c2UgZXZlbnRzXG4gICAgICAgIHByZXZUb3VjaFRpbWUgPSAwLFxuXG4gICAgICAgIC8vIEFsbG93IHRoaXMgbWFueSBpbnRlcmFjdGlvbnMgdG8gaGFwcGVuIHNpbXVsdGFuZW91c2x5XG4gICAgICAgIG1heEludGVyYWN0aW9ucyA9IEluZmluaXR5LFxuXG4gICAgICAgIC8vIENoZWNrIGlmIGlzIElFOSBvciBvbGRlclxuICAgICAgICBhY3Rpb25DdXJzb3JzID0gKGRvY3VtZW50LmFsbCAmJiAhd2luZG93LmF0b2IpID8ge1xuICAgICAgICAgICAgZHJhZyAgICA6ICdtb3ZlJyxcbiAgICAgICAgICAgIHJlc2l6ZXggOiAnZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpleSA6ICdzLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV4eTogJ3NlLXJlc2l6ZScsXG5cbiAgICAgICAgICAgIHJlc2l6ZXRvcCAgICAgICAgOiAnbi1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplbGVmdCAgICAgICA6ICd3LXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemVib3R0b20gICAgIDogJ3MtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXJpZ2h0ICAgICAgOiAnZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wbGVmdCAgICA6ICdzZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tcmlnaHQ6ICdzZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wcmlnaHQgICA6ICduZS1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tbGVmdCA6ICduZS1yZXNpemUnLFxuXG4gICAgICAgICAgICBnZXN0dXJlIDogJydcbiAgICAgICAgfSA6IHtcbiAgICAgICAgICAgIGRyYWcgICAgOiAnbW92ZScsXG4gICAgICAgICAgICByZXNpemV4IDogJ2V3LXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV5IDogJ25zLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemV4eTogJ253c2UtcmVzaXplJyxcblxuICAgICAgICAgICAgcmVzaXpldG9wICAgICAgICA6ICducy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplbGVmdCAgICAgICA6ICdldy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tICAgICA6ICducy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplcmlnaHQgICAgICA6ICdldy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXpldG9wbGVmdCAgICA6ICdud3NlLXJlc2l6ZScsXG4gICAgICAgICAgICByZXNpemVib3R0b21yaWdodDogJ253c2UtcmVzaXplJyxcbiAgICAgICAgICAgIHJlc2l6ZXRvcHJpZ2h0ICAgOiAnbmVzdy1yZXNpemUnLFxuICAgICAgICAgICAgcmVzaXplYm90dG9tbGVmdCA6ICduZXN3LXJlc2l6ZScsXG5cbiAgICAgICAgICAgIGdlc3R1cmUgOiAnJ1xuICAgICAgICB9LFxuXG4gICAgICAgIGFjdGlvbklzRW5hYmxlZCA9IHtcbiAgICAgICAgICAgIGRyYWcgICA6IHRydWUsXG4gICAgICAgICAgICByZXNpemUgOiB0cnVlLFxuICAgICAgICAgICAgZ2VzdHVyZTogdHJ1ZVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIGJlY2F1c2UgV2Via2l0IGFuZCBPcGVyYSBzdGlsbCB1c2UgJ21vdXNld2hlZWwnIGV2ZW50IHR5cGVcbiAgICAgICAgd2hlZWxFdmVudCA9ICdvbm1vdXNld2hlZWwnIGluIGRvY3VtZW50PyAnbW91c2V3aGVlbCc6ICd3aGVlbCcsXG5cbiAgICAgICAgZXZlbnRUeXBlcyA9IFtcbiAgICAgICAgICAgICdkcmFnc3RhcnQnLFxuICAgICAgICAgICAgJ2RyYWdtb3ZlJyxcbiAgICAgICAgICAgICdkcmFnaW5lcnRpYXN0YXJ0JyxcbiAgICAgICAgICAgICdkcmFnZW5kJyxcbiAgICAgICAgICAgICdkcmFnZW50ZXInLFxuICAgICAgICAgICAgJ2RyYWdsZWF2ZScsXG4gICAgICAgICAgICAnZHJvcGFjdGl2YXRlJyxcbiAgICAgICAgICAgICdkcm9wZGVhY3RpdmF0ZScsXG4gICAgICAgICAgICAnZHJvcG1vdmUnLFxuICAgICAgICAgICAgJ2Ryb3AnLFxuICAgICAgICAgICAgJ3Jlc2l6ZXN0YXJ0JyxcbiAgICAgICAgICAgICdyZXNpemVtb3ZlJyxcbiAgICAgICAgICAgICdyZXNpemVpbmVydGlhc3RhcnQnLFxuICAgICAgICAgICAgJ3Jlc2l6ZWVuZCcsXG4gICAgICAgICAgICAnZ2VzdHVyZXN0YXJ0JyxcbiAgICAgICAgICAgICdnZXN0dXJlbW92ZScsXG4gICAgICAgICAgICAnZ2VzdHVyZWluZXJ0aWFzdGFydCcsXG4gICAgICAgICAgICAnZ2VzdHVyZWVuZCcsXG5cbiAgICAgICAgICAgICdkb3duJyxcbiAgICAgICAgICAgICdtb3ZlJyxcbiAgICAgICAgICAgICd1cCcsXG4gICAgICAgICAgICAnY2FuY2VsJyxcbiAgICAgICAgICAgICd0YXAnLFxuICAgICAgICAgICAgJ2RvdWJsZXRhcCcsXG4gICAgICAgICAgICAnaG9sZCdcbiAgICAgICAgXSxcblxuICAgICAgICBnbG9iYWxFdmVudHMgPSB7fSxcblxuICAgICAgICAvLyBPcGVyYSBNb2JpbGUgbXVzdCBiZSBoYW5kbGVkIGRpZmZlcmVudGx5XG4gICAgICAgIGlzT3BlcmFNb2JpbGUgPSBuYXZpZ2F0b3IuYXBwTmFtZSA9PSAnT3BlcmEnICYmXG4gICAgICAgICAgICBzdXBwb3J0c1RvdWNoICYmXG4gICAgICAgICAgICBuYXZpZ2F0b3IudXNlckFnZW50Lm1hdGNoKCdQcmVzdG8nKSxcblxuICAgICAgICAvLyBzY3JvbGxpbmcgZG9lc24ndCBjaGFuZ2UgdGhlIHJlc3VsdCBvZlxuICAgICAgICAvLyBnZXRCb3VuZGluZ0NsaWVudFJlY3QvZ2V0Q2xpZW50UmVjdHMgb24gaU9TIDw9NyBidXQgaXQgZG9lcyBvbiBpT1MgOFxuICAgICAgICBpc0lPUzdvckxvd2VyID0gKC9pUChob25lfG9kfGFkKS8udGVzdChuYXZpZ2F0b3IucGxhdGZvcm0pXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgL09TIFsxLTddW15cXGRdLy50ZXN0KG5hdmlnYXRvci5hcHBWZXJzaW9uKSksXG5cbiAgICAgICAgLy8gcHJlZml4IG1hdGNoZXNTZWxlY3RvclxuICAgICAgICBwcmVmaXhlZE1hdGNoZXNTZWxlY3RvciA9ICdtYXRjaGVzJyBpbiBFbGVtZW50LnByb3RvdHlwZT9cbiAgICAgICAgICAgICAgICAnbWF0Y2hlcyc6ICd3ZWJraXRNYXRjaGVzU2VsZWN0b3InIGluIEVsZW1lbnQucHJvdG90eXBlP1xuICAgICAgICAgICAgICAgICAgICAnd2Via2l0TWF0Y2hlc1NlbGVjdG9yJzogJ21vek1hdGNoZXNTZWxlY3RvcicgaW4gRWxlbWVudC5wcm90b3R5cGU/XG4gICAgICAgICAgICAgICAgICAgICAgICAnbW96TWF0Y2hlc1NlbGVjdG9yJzogJ29NYXRjaGVzU2VsZWN0b3InIGluIEVsZW1lbnQucHJvdG90eXBlP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdvTWF0Y2hlc1NlbGVjdG9yJzogJ21zTWF0Y2hlc1NlbGVjdG9yJyxcblxuICAgICAgICAvLyB3aWxsIGJlIHBvbHlmaWxsIGZ1bmN0aW9uIGlmIGJyb3dzZXIgaXMgSUU4XG4gICAgICAgIGllOE1hdGNoZXNTZWxlY3RvcixcblxuICAgICAgICAvLyBuYXRpdmUgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIG9yIHBvbHlmaWxsXG4gICAgICAgIHJlcUZyYW1lID0gcmVhbFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUsXG4gICAgICAgIGNhbmNlbEZyYW1lID0gcmVhbFdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZSxcblxuICAgICAgICAvLyBFdmVudHMgd3JhcHBlclxuICAgICAgICBldmVudHMgPSAoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHVzZUF0dGFjaEV2ZW50ID0gKCdhdHRhY2hFdmVudCcgaW4gd2luZG93KSAmJiAhKCdhZGRFdmVudExpc3RlbmVyJyBpbiB3aW5kb3cpLFxuICAgICAgICAgICAgICAgIGFkZEV2ZW50ICAgICAgID0gdXNlQXR0YWNoRXZlbnQ/ICAnYXR0YWNoRXZlbnQnOiAnYWRkRXZlbnRMaXN0ZW5lcicsXG4gICAgICAgICAgICAgICAgcmVtb3ZlRXZlbnQgICAgPSB1c2VBdHRhY2hFdmVudD8gICdkZXRhY2hFdmVudCc6ICdyZW1vdmVFdmVudExpc3RlbmVyJyxcbiAgICAgICAgICAgICAgICBvbiAgICAgICAgICAgICA9IHVzZUF0dGFjaEV2ZW50PyAnb24nOiAnJyxcblxuICAgICAgICAgICAgICAgIGVsZW1lbnRzICAgICAgICAgID0gW10sXG4gICAgICAgICAgICAgICAgdGFyZ2V0cyAgICAgICAgICAgPSBbXSxcbiAgICAgICAgICAgICAgICBhdHRhY2hlZExpc3RlbmVycyA9IFtdO1xuXG4gICAgICAgICAgICBmdW5jdGlvbiBhZGQgKGVsZW1lbnQsIHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgICAgICAgICAgdmFyIGVsZW1lbnRJbmRleCA9IGluZGV4T2YoZWxlbWVudHMsIGVsZW1lbnQpLFxuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXRzW2VsZW1lbnRJbmRleF07XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudHM6IHt9LFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZUNvdW50OiAwXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudEluZGV4ID0gZWxlbWVudHMucHVzaChlbGVtZW50KSAtIDE7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh0YXJnZXQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGF0dGFjaGVkTGlzdGVuZXJzLnB1c2goKHVzZUF0dGFjaEV2ZW50ID8ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1cHBsaWVkOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3cmFwcGVkIDogW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdXNlQ291bnQ6IFtdXG4gICAgICAgICAgICAgICAgICAgICAgICB9IDogbnVsbCkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0LmV2ZW50c1t0eXBlXSkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQuZXZlbnRzW3R5cGVdID0gW107XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC50eXBlQ291bnQrKztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIWNvbnRhaW5zKHRhcmdldC5ldmVudHNbdHlwZV0sIGxpc3RlbmVyKSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcmV0O1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICh1c2VBdHRhY2hFdmVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGxpc3RlbmVycyA9IGF0dGFjaGVkTGlzdGVuZXJzW2VsZW1lbnRJbmRleF0sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJJbmRleCA9IGluZGV4T2YobGlzdGVuZXJzLnN1cHBsaWVkLCBsaXN0ZW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB3cmFwcGVkID0gbGlzdGVuZXJzLndyYXBwZWRbbGlzdGVuZXJJbmRleF0gfHwgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFldmVudC5pbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQudGFyZ2V0ID0gZXZlbnQuc3JjRWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuY3VycmVudFRhcmdldCA9IGVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQgPSBldmVudC5wcmV2ZW50RGVmYXVsdCB8fCBwcmV2ZW50RGVmO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24gPSBldmVudC5zdG9wUHJvcGFnYXRpb24gfHwgc3RvcFByb3A7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbiA9IGV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbiB8fCBzdG9wSW1tUHJvcDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoL21vdXNlfGNsaWNrLy50ZXN0KGV2ZW50LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5wYWdlWCA9IGV2ZW50LmNsaWVudFggKyBnZXRXaW5kb3coZWxlbWVudCkuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbExlZnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5wYWdlWSA9IGV2ZW50LmNsaWVudFkgKyBnZXRXaW5kb3coZWxlbWVudCkuZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnNjcm9sbFRvcDtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXQgPSBlbGVtZW50W2FkZEV2ZW50XShvbiArIHR5cGUsIHdyYXBwZWQsIEJvb2xlYW4odXNlQ2FwdHVyZSkpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJJbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMuc3VwcGxpZWQucHVzaChsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLndyYXBwZWQucHVzaCh3cmFwcGVkKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMudXNlQ291bnQucHVzaCgxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy51c2VDb3VudFtsaXN0ZW5lckluZGV4XSsrO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0ID0gZWxlbWVudFthZGRFdmVudF0odHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUgfHwgZmFsc2UpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG5cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHJlbW92ZSAoZWxlbWVudCwgdHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICB2YXIgaSxcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudEluZGV4ID0gaW5kZXhPZihlbGVtZW50cywgZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldCA9IHRhcmdldHNbZWxlbWVudEluZGV4XSxcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lckluZGV4LFxuICAgICAgICAgICAgICAgICAgICB3cmFwcGVkID0gbGlzdGVuZXI7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXRhcmdldCB8fCAhdGFyZ2V0LmV2ZW50cykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHVzZUF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IGF0dGFjaGVkTGlzdGVuZXJzW2VsZW1lbnRJbmRleF07XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVySW5kZXggPSBpbmRleE9mKGxpc3RlbmVycy5zdXBwbGllZCwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICB3cmFwcGVkID0gbGlzdGVuZXJzLndyYXBwZWRbbGlzdGVuZXJJbmRleF07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHR5cGUgPT09ICdhbGwnKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodHlwZSBpbiB0YXJnZXQuZXZlbnRzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0LmV2ZW50cy5oYXNPd25Qcm9wZXJ0eSh0eXBlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlbW92ZShlbGVtZW50LCB0eXBlLCAnYWxsJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuZXZlbnRzW3R5cGVdKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBsZW4gPSB0YXJnZXQuZXZlbnRzW3R5cGVdLmxlbmd0aDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXIgPT09ICdhbGwnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdmUoZWxlbWVudCwgdHlwZSwgdGFyZ2V0LmV2ZW50c1t0eXBlXVtpXSwgQm9vbGVhbih1c2VDYXB0dXJlKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGFyZ2V0LmV2ZW50c1t0eXBlXVtpXSA9PT0gbGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFtyZW1vdmVFdmVudF0ob24gKyB0eXBlLCB3cmFwcGVkLCB1c2VDYXB0dXJlIHx8IGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmV2ZW50c1t0eXBlXS5zcGxpY2UoaSwgMSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHVzZUF0dGFjaEV2ZW50ICYmIGxpc3RlbmVycykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnVzZUNvdW50W2xpc3RlbmVySW5kZXhdLS07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobGlzdGVuZXJzLnVzZUNvdW50W2xpc3RlbmVySW5kZXhdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnN1cHBsaWVkLnNwbGljZShsaXN0ZW5lckluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMud3JhcHBlZC5zcGxpY2UobGlzdGVuZXJJbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnVzZUNvdW50LnNwbGljZShsaXN0ZW5lckluZGV4LCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICh0YXJnZXQuZXZlbnRzW3R5cGVdICYmIHRhcmdldC5ldmVudHNbdHlwZV0ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQuZXZlbnRzW3R5cGVdID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC50eXBlQ291bnQtLTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghdGFyZ2V0LnR5cGVDb3VudCkge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnNwbGljZShlbGVtZW50SW5kZXgpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5zcGxpY2UoZWxlbWVudEluZGV4KTtcbiAgICAgICAgICAgICAgICAgICAgYXR0YWNoZWRMaXN0ZW5lcnMuc3BsaWNlKGVsZW1lbnRJbmRleCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBmdW5jdGlvbiBwcmV2ZW50RGVmICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnJldHVyblZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHN0b3BQcm9wICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbmNlbEJ1YmJsZSA9IHRydWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHN0b3BJbW1Qcm9wICgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmNhbmNlbEJ1YmJsZSA9IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5pbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGFkZDogYWRkLFxuICAgICAgICAgICAgICAgIHJlbW92ZTogcmVtb3ZlLFxuICAgICAgICAgICAgICAgIHVzZUF0dGFjaEV2ZW50OiB1c2VBdHRhY2hFdmVudCxcblxuICAgICAgICAgICAgICAgIF9lbGVtZW50czogZWxlbWVudHMsXG4gICAgICAgICAgICAgICAgX3RhcmdldHM6IHRhcmdldHMsXG4gICAgICAgICAgICAgICAgX2F0dGFjaGVkTGlzdGVuZXJzOiBhdHRhY2hlZExpc3RlbmVyc1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSgpKTtcblxuICAgIGZ1bmN0aW9uIGJsYW5rICgpIHt9XG5cbiAgICBmdW5jdGlvbiBpc0VsZW1lbnQgKG8pIHtcbiAgICAgICAgaWYgKCFvIHx8ICh0eXBlb2YgbyAhPT0gJ29iamVjdCcpKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIHZhciBfd2luZG93ID0gZ2V0V2luZG93KG8pIHx8IHdpbmRvdztcblxuICAgICAgICByZXR1cm4gKC9vYmplY3R8ZnVuY3Rpb24vLnRlc3QodHlwZW9mIF93aW5kb3cuRWxlbWVudClcbiAgICAgICAgICAgID8gbyBpbnN0YW5jZW9mIF93aW5kb3cuRWxlbWVudCAvL0RPTTJcbiAgICAgICAgICAgIDogby5ub2RlVHlwZSA9PT0gMSAmJiB0eXBlb2Ygby5ub2RlTmFtZSA9PT0gXCJzdHJpbmdcIik7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGlzV2luZG93ICh0aGluZykgeyByZXR1cm4gISEodGhpbmcgJiYgdGhpbmcuV2luZG93KSAmJiAodGhpbmcgaW5zdGFuY2VvZiB0aGluZy5XaW5kb3cpOyB9XG4gICAgZnVuY3Rpb24gaXNEb2NGcmFnICh0aGluZykgeyByZXR1cm4gISF0aGluZyAmJiB0aGluZyBpbnN0YW5jZW9mIERvY3VtZW50RnJhZ21lbnQ7IH1cbiAgICBmdW5jdGlvbiBpc0FycmF5ICh0aGluZykge1xuICAgICAgICByZXR1cm4gaXNPYmplY3QodGhpbmcpXG4gICAgICAgICAgICAgICAgJiYgKHR5cGVvZiB0aGluZy5sZW5ndGggIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgICAgICAmJiBpc0Z1bmN0aW9uKHRoaW5nLnNwbGljZSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGlzT2JqZWN0ICAgKHRoaW5nKSB7IHJldHVybiAhIXRoaW5nICYmICh0eXBlb2YgdGhpbmcgPT09ICdvYmplY3QnKTsgfVxuICAgIGZ1bmN0aW9uIGlzRnVuY3Rpb24gKHRoaW5nKSB7IHJldHVybiB0eXBlb2YgdGhpbmcgPT09ICdmdW5jdGlvbic7IH1cbiAgICBmdW5jdGlvbiBpc051bWJlciAgICh0aGluZykgeyByZXR1cm4gdHlwZW9mIHRoaW5nID09PSAnbnVtYmVyJyAgOyB9XG4gICAgZnVuY3Rpb24gaXNCb29sICAgICAodGhpbmcpIHsgcmV0dXJuIHR5cGVvZiB0aGluZyA9PT0gJ2Jvb2xlYW4nIDsgfVxuICAgIGZ1bmN0aW9uIGlzU3RyaW5nICAgKHRoaW5nKSB7IHJldHVybiB0eXBlb2YgdGhpbmcgPT09ICdzdHJpbmcnICA7IH1cblxuICAgIGZ1bmN0aW9uIHRyeVNlbGVjdG9yICh2YWx1ZSkge1xuICAgICAgICBpZiAoIWlzU3RyaW5nKHZhbHVlKSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICAvLyBhbiBleGNlcHRpb24gd2lsbCBiZSByYWlzZWQgaWYgaXQgaXMgaW52YWxpZFxuICAgICAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXh0ZW5kIChkZXN0LCBzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIGRlc3RbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGRlc3Q7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29weUNvb3JkcyAoZGVzdCwgc3JjKSB7XG4gICAgICAgIGRlc3QucGFnZSA9IGRlc3QucGFnZSB8fCB7fTtcbiAgICAgICAgZGVzdC5wYWdlLnggPSBzcmMucGFnZS54O1xuICAgICAgICBkZXN0LnBhZ2UueSA9IHNyYy5wYWdlLnk7XG5cbiAgICAgICAgZGVzdC5jbGllbnQgPSBkZXN0LmNsaWVudCB8fCB7fTtcbiAgICAgICAgZGVzdC5jbGllbnQueCA9IHNyYy5jbGllbnQueDtcbiAgICAgICAgZGVzdC5jbGllbnQueSA9IHNyYy5jbGllbnQueTtcblxuICAgICAgICBkZXN0LnRpbWVTdGFtcCA9IHNyYy50aW1lU3RhbXA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0RXZlbnRYWSAodGFyZ2V0T2JqLCBwb2ludGVyLCBpbnRlcmFjdGlvbikge1xuICAgICAgICBpZiAoIXBvaW50ZXIpIHtcbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5wb2ludGVySWRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICBwb2ludGVyID0gdG91Y2hBdmVyYWdlKGludGVyYWN0aW9uLnBvaW50ZXJzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBvaW50ZXIgPSBpbnRlcmFjdGlvbi5wb2ludGVyc1swXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGdldFBhZ2VYWShwb2ludGVyLCB0bXBYWSwgaW50ZXJhY3Rpb24pO1xuICAgICAgICB0YXJnZXRPYmoucGFnZS54ID0gdG1wWFkueDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UueSA9IHRtcFhZLnk7XG5cbiAgICAgICAgZ2V0Q2xpZW50WFkocG9pbnRlciwgdG1wWFksIGludGVyYWN0aW9uKTtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC54ID0gdG1wWFkueDtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC55ID0gdG1wWFkueTtcblxuICAgICAgICB0YXJnZXRPYmoudGltZVN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2V0RXZlbnREZWx0YXMgKHRhcmdldE9iaiwgcHJldiwgY3VyKSB7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnggICAgID0gY3VyLnBhZ2UueCAgICAgIC0gcHJldi5wYWdlLng7XG4gICAgICAgIHRhcmdldE9iai5wYWdlLnkgICAgID0gY3VyLnBhZ2UueSAgICAgIC0gcHJldi5wYWdlLnk7XG4gICAgICAgIHRhcmdldE9iai5jbGllbnQueCAgID0gY3VyLmNsaWVudC54ICAgIC0gcHJldi5jbGllbnQueDtcbiAgICAgICAgdGFyZ2V0T2JqLmNsaWVudC55ICAgPSBjdXIuY2xpZW50LnkgICAgLSBwcmV2LmNsaWVudC55O1xuICAgICAgICB0YXJnZXRPYmoudGltZVN0YW1wID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBwcmV2LnRpbWVTdGFtcDtcblxuICAgICAgICAvLyBzZXQgcG9pbnRlciB2ZWxvY2l0eVxuICAgICAgICB2YXIgZHQgPSBNYXRoLm1heCh0YXJnZXRPYmoudGltZVN0YW1wIC8gMTAwMCwgMC4wMDEpO1xuICAgICAgICB0YXJnZXRPYmoucGFnZS5zcGVlZCAgID0gaHlwb3QodGFyZ2V0T2JqLnBhZ2UueCwgdGFyZ2V0T2JqLnBhZ2UueSkgLyBkdDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UudnggICAgICA9IHRhcmdldE9iai5wYWdlLnggLyBkdDtcbiAgICAgICAgdGFyZ2V0T2JqLnBhZ2UudnkgICAgICA9IHRhcmdldE9iai5wYWdlLnkgLyBkdDtcblxuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnNwZWVkID0gaHlwb3QodGFyZ2V0T2JqLmNsaWVudC54LCB0YXJnZXRPYmoucGFnZS55KSAvIGR0O1xuICAgICAgICB0YXJnZXRPYmouY2xpZW50LnZ4ICAgID0gdGFyZ2V0T2JqLmNsaWVudC54IC8gZHQ7XG4gICAgICAgIHRhcmdldE9iai5jbGllbnQudnkgICAgPSB0YXJnZXRPYmouY2xpZW50LnkgLyBkdDtcbiAgICB9XG5cbiAgICAvLyBHZXQgc3BlY2lmaWVkIFgvWSBjb29yZHMgZm9yIG1vdXNlIG9yIGV2ZW50LnRvdWNoZXNbMF1cbiAgICBmdW5jdGlvbiBnZXRYWSAodHlwZSwgcG9pbnRlciwgeHkpIHtcbiAgICAgICAgeHkgPSB4eSB8fCB7fTtcbiAgICAgICAgdHlwZSA9IHR5cGUgfHwgJ3BhZ2UnO1xuXG4gICAgICAgIHh5LnggPSBwb2ludGVyW3R5cGUgKyAnWCddO1xuICAgICAgICB4eS55ID0gcG9pbnRlclt0eXBlICsgJ1knXTtcblxuICAgICAgICByZXR1cm4geHk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UGFnZVhZIChwb2ludGVyLCBwYWdlLCBpbnRlcmFjdGlvbikge1xuICAgICAgICBwYWdlID0gcGFnZSB8fCB7fTtcblxuICAgICAgICBpZiAocG9pbnRlciBpbnN0YW5jZW9mIEludGVyYWN0RXZlbnQpIHtcbiAgICAgICAgICAgIGlmICgvaW5lcnRpYXN0YXJ0Ly50ZXN0KHBvaW50ZXIudHlwZSkpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uIHx8IHBvaW50ZXIuaW50ZXJhY3Rpb247XG5cbiAgICAgICAgICAgICAgICBleHRlbmQocGFnZSwgaW50ZXJhY3Rpb24uaW5lcnRpYVN0YXR1cy51cENvb3Jkcy5wYWdlKTtcblxuICAgICAgICAgICAgICAgIHBhZ2UueCArPSBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzLnN4O1xuICAgICAgICAgICAgICAgIHBhZ2UueSArPSBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzLnN5O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcGFnZS54ID0gcG9pbnRlci5wYWdlWDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgPSBwb2ludGVyLnBhZ2VZO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIE9wZXJhIE1vYmlsZSBoYW5kbGVzIHRoZSB2aWV3cG9ydCBhbmQgc2Nyb2xsaW5nIG9kZGx5XG4gICAgICAgIGVsc2UgaWYgKGlzT3BlcmFNb2JpbGUpIHtcbiAgICAgICAgICAgIGdldFhZKCdzY3JlZW4nLCBwb2ludGVyLCBwYWdlKTtcblxuICAgICAgICAgICAgcGFnZS54ICs9IHdpbmRvdy5zY3JvbGxYO1xuICAgICAgICAgICAgcGFnZS55ICs9IHdpbmRvdy5zY3JvbGxZO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgZ2V0WFkoJ3BhZ2UnLCBwb2ludGVyLCBwYWdlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYWdlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldENsaWVudFhZIChwb2ludGVyLCBjbGllbnQsIGludGVyYWN0aW9uKSB7XG4gICAgICAgIGNsaWVudCA9IGNsaWVudCB8fCB7fTtcblxuICAgICAgICBpZiAocG9pbnRlciBpbnN0YW5jZW9mIEludGVyYWN0RXZlbnQpIHtcbiAgICAgICAgICAgIGlmICgvaW5lcnRpYXN0YXJ0Ly50ZXN0KHBvaW50ZXIudHlwZSkpIHtcbiAgICAgICAgICAgICAgICBleHRlbmQoY2xpZW50LCBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzLnVwQ29vcmRzLmNsaWVudCk7XG5cbiAgICAgICAgICAgICAgICBjbGllbnQueCArPSBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzLnN4O1xuICAgICAgICAgICAgICAgIGNsaWVudC55ICs9IGludGVyYWN0aW9uLmluZXJ0aWFTdGF0dXMuc3k7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjbGllbnQueCA9IHBvaW50ZXIuY2xpZW50WDtcbiAgICAgICAgICAgICAgICBjbGllbnQueSA9IHBvaW50ZXIuY2xpZW50WTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIE9wZXJhIE1vYmlsZSBoYW5kbGVzIHRoZSB2aWV3cG9ydCBhbmQgc2Nyb2xsaW5nIG9kZGx5XG4gICAgICAgICAgICBnZXRYWShpc09wZXJhTW9iaWxlPyAnc2NyZWVuJzogJ2NsaWVudCcsIHBvaW50ZXIsIGNsaWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY2xpZW50O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFNjcm9sbFhZICh3aW4pIHtcbiAgICAgICAgd2luID0gd2luIHx8IHdpbmRvdztcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHg6IHdpbi5zY3JvbGxYIHx8IHdpbi5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsTGVmdCxcbiAgICAgICAgICAgIHk6IHdpbi5zY3JvbGxZIHx8IHdpbi5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2Nyb2xsVG9wXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0UG9pbnRlcklkIChwb2ludGVyKSB7XG4gICAgICAgIHJldHVybiBpc051bWJlcihwb2ludGVyLnBvaW50ZXJJZCk/IHBvaW50ZXIucG9pbnRlcklkIDogcG9pbnRlci5pZGVudGlmaWVyO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEFjdHVhbEVsZW1lbnQgKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIChlbGVtZW50IGluc3RhbmNlb2YgU1ZHRWxlbWVudEluc3RhbmNlXG4gICAgICAgICAgICA/IGVsZW1lbnQuY29ycmVzcG9uZGluZ1VzZUVsZW1lbnRcbiAgICAgICAgICAgIDogZWxlbWVudCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0V2luZG93IChub2RlKSB7XG4gICAgICAgIGlmIChpc1dpbmRvdyhub2RlKSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgcm9vdE5vZGUgPSAobm9kZS5vd25lckRvY3VtZW50IHx8IG5vZGUpO1xuXG4gICAgICAgIHJldHVybiByb290Tm9kZS5kZWZhdWx0VmlldyB8fCByb290Tm9kZS5wYXJlbnRXaW5kb3cgfHwgd2luZG93O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEVsZW1lbnRSZWN0IChlbGVtZW50KSB7XG4gICAgICAgIHZhciBzY3JvbGwgPSBpc0lPUzdvckxvd2VyXG4gICAgICAgICAgICAgICAgPyB7IHg6IDAsIHk6IDAgfVxuICAgICAgICAgICAgICAgIDogZ2V0U2Nyb2xsWFkoZ2V0V2luZG93KGVsZW1lbnQpKSxcbiAgICAgICAgICAgIGNsaWVudFJlY3QgPSAoZWxlbWVudCBpbnN0YW5jZW9mIFNWR0VsZW1lbnQpP1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk6XG4gICAgICAgICAgICAgICAgZWxlbWVudC5nZXRDbGllbnRSZWN0cygpWzBdO1xuXG4gICAgICAgIHJldHVybiBjbGllbnRSZWN0ICYmIHtcbiAgICAgICAgICAgIGxlZnQgIDogY2xpZW50UmVjdC5sZWZ0ICAgKyBzY3JvbGwueCxcbiAgICAgICAgICAgIHJpZ2h0IDogY2xpZW50UmVjdC5yaWdodCAgKyBzY3JvbGwueCxcbiAgICAgICAgICAgIHRvcCAgIDogY2xpZW50UmVjdC50b3AgICAgKyBzY3JvbGwueSxcbiAgICAgICAgICAgIGJvdHRvbTogY2xpZW50UmVjdC5ib3R0b20gKyBzY3JvbGwueSxcbiAgICAgICAgICAgIHdpZHRoIDogY2xpZW50UmVjdC53aWR0aCB8fCBjbGllbnRSZWN0LnJpZ2h0IC0gY2xpZW50UmVjdC5sZWZ0LFxuICAgICAgICAgICAgaGVpZ2h0OiBjbGllbnRSZWN0LmhlaWdoIHx8IGNsaWVudFJlY3QuYm90dG9tIC0gY2xpZW50UmVjdC50b3BcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRUb3VjaFBhaXIgKGV2ZW50KSB7XG4gICAgICAgIHZhciB0b3VjaGVzID0gW107XG5cbiAgICAgICAgLy8gYXJyYXkgb2YgdG91Y2hlcyBpcyBzdXBwbGllZFxuICAgICAgICBpZiAoaXNBcnJheShldmVudCkpIHtcbiAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudFswXTtcbiAgICAgICAgICAgIHRvdWNoZXNbMV0gPSBldmVudFsxXTtcbiAgICAgICAgfVxuICAgICAgICAvLyBhbiBldmVudFxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmIChldmVudC50eXBlID09PSAndG91Y2hlbmQnKSB7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC50b3VjaGVzWzBdO1xuICAgICAgICAgICAgICAgICAgICB0b3VjaGVzWzFdID0gZXZlbnQuY2hhbmdlZFRvdWNoZXNbMF07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGV2ZW50LnRvdWNoZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC5jaGFuZ2VkVG91Y2hlc1swXTtcbiAgICAgICAgICAgICAgICAgICAgdG91Y2hlc1sxXSA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzWzFdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRvdWNoZXNbMF0gPSBldmVudC50b3VjaGVzWzBdO1xuICAgICAgICAgICAgICAgIHRvdWNoZXNbMV0gPSBldmVudC50b3VjaGVzWzFdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRvdWNoZXM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG91Y2hBdmVyYWdlIChldmVudCkge1xuICAgICAgICB2YXIgdG91Y2hlcyA9IGdldFRvdWNoUGFpcihldmVudCk7XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHBhZ2VYOiAodG91Y2hlc1swXS5wYWdlWCArIHRvdWNoZXNbMV0ucGFnZVgpIC8gMixcbiAgICAgICAgICAgIHBhZ2VZOiAodG91Y2hlc1swXS5wYWdlWSArIHRvdWNoZXNbMV0ucGFnZVkpIC8gMixcbiAgICAgICAgICAgIGNsaWVudFg6ICh0b3VjaGVzWzBdLmNsaWVudFggKyB0b3VjaGVzWzFdLmNsaWVudFgpIC8gMixcbiAgICAgICAgICAgIGNsaWVudFk6ICh0b3VjaGVzWzBdLmNsaWVudFkgKyB0b3VjaGVzWzFdLmNsaWVudFkpIC8gMlxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvdWNoQkJveCAoZXZlbnQpIHtcbiAgICAgICAgaWYgKCFldmVudC5sZW5ndGggJiYgIShldmVudC50b3VjaGVzICYmIGV2ZW50LnRvdWNoZXMubGVuZ3RoID4gMSkpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KSxcbiAgICAgICAgICAgIG1pblggPSBNYXRoLm1pbih0b3VjaGVzWzBdLnBhZ2VYLCB0b3VjaGVzWzFdLnBhZ2VYKSxcbiAgICAgICAgICAgIG1pblkgPSBNYXRoLm1pbih0b3VjaGVzWzBdLnBhZ2VZLCB0b3VjaGVzWzFdLnBhZ2VZKSxcbiAgICAgICAgICAgIG1heFggPSBNYXRoLm1heCh0b3VjaGVzWzBdLnBhZ2VYLCB0b3VjaGVzWzFdLnBhZ2VYKSxcbiAgICAgICAgICAgIG1heFkgPSBNYXRoLm1heCh0b3VjaGVzWzBdLnBhZ2VZLCB0b3VjaGVzWzFdLnBhZ2VZKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgeDogbWluWCxcbiAgICAgICAgICAgIHk6IG1pblksXG4gICAgICAgICAgICBsZWZ0OiBtaW5YLFxuICAgICAgICAgICAgdG9wOiBtaW5ZLFxuICAgICAgICAgICAgd2lkdGg6IG1heFggLSBtaW5YLFxuICAgICAgICAgICAgaGVpZ2h0OiBtYXhZIC0gbWluWVxuICAgICAgICB9O1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRvdWNoRGlzdGFuY2UgKGV2ZW50LCBkZWx0YVNvdXJjZSkge1xuICAgICAgICBkZWx0YVNvdXJjZSA9IGRlbHRhU291cmNlIHx8IGRlZmF1bHRPcHRpb25zLmRlbHRhU291cmNlO1xuXG4gICAgICAgIHZhciBzb3VyY2VYID0gZGVsdGFTb3VyY2UgKyAnWCcsXG4gICAgICAgICAgICBzb3VyY2VZID0gZGVsdGFTb3VyY2UgKyAnWScsXG4gICAgICAgICAgICB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KTtcblxuXG4gICAgICAgIHZhciBkeCA9IHRvdWNoZXNbMF1bc291cmNlWF0gLSB0b3VjaGVzWzFdW3NvdXJjZVhdLFxuICAgICAgICAgICAgZHkgPSB0b3VjaGVzWzBdW3NvdXJjZVldIC0gdG91Y2hlc1sxXVtzb3VyY2VZXTtcblxuICAgICAgICByZXR1cm4gaHlwb3QoZHgsIGR5KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0b3VjaEFuZ2xlIChldmVudCwgcHJldkFuZ2xlLCBkZWx0YVNvdXJjZSkge1xuICAgICAgICBkZWx0YVNvdXJjZSA9IGRlbHRhU291cmNlIHx8IGRlZmF1bHRPcHRpb25zLmRlbHRhU291cmNlO1xuXG4gICAgICAgIHZhciBzb3VyY2VYID0gZGVsdGFTb3VyY2UgKyAnWCcsXG4gICAgICAgICAgICBzb3VyY2VZID0gZGVsdGFTb3VyY2UgKyAnWScsXG4gICAgICAgICAgICB0b3VjaGVzID0gZ2V0VG91Y2hQYWlyKGV2ZW50KSxcbiAgICAgICAgICAgIGR4ID0gdG91Y2hlc1swXVtzb3VyY2VYXSAtIHRvdWNoZXNbMV1bc291cmNlWF0sXG4gICAgICAgICAgICBkeSA9IHRvdWNoZXNbMF1bc291cmNlWV0gLSB0b3VjaGVzWzFdW3NvdXJjZVldLFxuICAgICAgICAgICAgYW5nbGUgPSAxODAgKiBNYXRoLmF0YW4oZHkgLyBkeCkgLyBNYXRoLlBJO1xuXG4gICAgICAgIGlmIChpc051bWJlcihwcmV2QW5nbGUpKSB7XG4gICAgICAgICAgICB2YXIgZHIgPSBhbmdsZSAtIHByZXZBbmdsZSxcbiAgICAgICAgICAgICAgICBkckNsYW1wZWQgPSBkciAlIDM2MDtcblxuICAgICAgICAgICAgaWYgKGRyQ2xhbXBlZCA+IDMxNSkge1xuICAgICAgICAgICAgICAgIGFuZ2xlIC09IDM2MCArIChhbmdsZSAvIDM2MCl8MCAqIDM2MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGRyQ2xhbXBlZCA+IDEzNSkge1xuICAgICAgICAgICAgICAgIGFuZ2xlIC09IDE4MCArIChhbmdsZSAvIDM2MCl8MCAqIDM2MDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKGRyQ2xhbXBlZCA8IC0zMTUpIHtcbiAgICAgICAgICAgICAgICBhbmdsZSArPSAzNjAgKyAoYW5nbGUgLyAzNjApfDAgKiAzNjA7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChkckNsYW1wZWQgPCAtMTM1KSB7XG4gICAgICAgICAgICAgICAgYW5nbGUgKz0gMTgwICsgKGFuZ2xlIC8gMzYwKXwwICogMzYwO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuICBhbmdsZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRPcmlnaW5YWSAoaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgIHZhciBvcmlnaW4gPSBpbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICA/IGludGVyYWN0YWJsZS5vcHRpb25zLm9yaWdpblxuICAgICAgICAgICAgICAgIDogZGVmYXVsdE9wdGlvbnMub3JpZ2luO1xuXG4gICAgICAgIGlmIChvcmlnaW4gPT09ICdwYXJlbnQnKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKG9yaWdpbiA9PT0gJ3NlbGYnKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBpbnRlcmFjdGFibGUuZ2V0UmVjdChlbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICh0cnlTZWxlY3RvcihvcmlnaW4pKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBjbG9zZXN0KGVsZW1lbnQsIG9yaWdpbikgfHwgeyB4OiAwLCB5OiAwIH07XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNGdW5jdGlvbihvcmlnaW4pKSB7XG4gICAgICAgICAgICBvcmlnaW4gPSBvcmlnaW4oaW50ZXJhY3RhYmxlICYmIGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzRWxlbWVudChvcmlnaW4pKSAge1xuICAgICAgICAgICAgb3JpZ2luID0gZ2V0RWxlbWVudFJlY3Qob3JpZ2luKTtcbiAgICAgICAgfVxuXG4gICAgICAgIG9yaWdpbi54ID0gKCd4JyBpbiBvcmlnaW4pPyBvcmlnaW4ueCA6IG9yaWdpbi5sZWZ0O1xuICAgICAgICBvcmlnaW4ueSA9ICgneScgaW4gb3JpZ2luKT8gb3JpZ2luLnkgOiBvcmlnaW4udG9wO1xuXG4gICAgICAgIHJldHVybiBvcmlnaW47XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvNTYzNDUyOC8yMjgwODg4XG4gICAgZnVuY3Rpb24gX2dldFFCZXppZXJWYWx1ZSh0LCBwMSwgcDIsIHAzKSB7XG4gICAgICAgIHZhciBpVCA9IDEgLSB0O1xuICAgICAgICByZXR1cm4gaVQgKiBpVCAqIHAxICsgMiAqIGlUICogdCAqIHAyICsgdCAqIHQgKiBwMztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRRdWFkcmF0aWNDdXJ2ZVBvaW50KHN0YXJ0WCwgc3RhcnRZLCBjcFgsIGNwWSwgZW5kWCwgZW5kWSwgcG9zaXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHg6ICBfZ2V0UUJlemllclZhbHVlKHBvc2l0aW9uLCBzdGFydFgsIGNwWCwgZW5kWCksXG4gICAgICAgICAgICB5OiAgX2dldFFCZXppZXJWYWx1ZShwb3NpdGlvbiwgc3RhcnRZLCBjcFksIGVuZFkpXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gaHR0cDovL2dpem1hLmNvbS9lYXNpbmcvXG4gICAgZnVuY3Rpb24gZWFzZU91dFF1YWQgKHQsIGIsIGMsIGQpIHtcbiAgICAgICAgdCAvPSBkO1xuICAgICAgICByZXR1cm4gLWMgKiB0Kih0LTIpICsgYjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBub2RlQ29udGFpbnMgKHBhcmVudCwgY2hpbGQpIHtcbiAgICAgICAgd2hpbGUgKGNoaWxkKSB7XG4gICAgICAgICAgICBpZiAoY2hpbGQgPT09IHBhcmVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjaGlsZCA9IGNoaWxkLnBhcmVudE5vZGU7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xvc2VzdCAoY2hpbGQsIHNlbGVjdG9yKSB7XG4gICAgICAgIHZhciBwYXJlbnQgPSBwYXJlbnRFbGVtZW50KGNoaWxkKTtcblxuICAgICAgICB3aGlsZSAoaXNFbGVtZW50KHBhcmVudCkpIHtcbiAgICAgICAgICAgIGlmIChtYXRjaGVzU2VsZWN0b3IocGFyZW50LCBzZWxlY3RvcikpIHsgcmV0dXJuIHBhcmVudDsgfVxuXG4gICAgICAgICAgICBwYXJlbnQgPSBwYXJlbnRFbGVtZW50KHBhcmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwYXJlbnRFbGVtZW50IChub2RlKSB7XG4gICAgICAgIHZhciBwYXJlbnQgPSBub2RlLnBhcmVudE5vZGU7XG5cbiAgICAgICAgaWYgKGlzRG9jRnJhZyhwYXJlbnQpKSB7XG4gICAgICAgICAgICAvLyBza2lwIHBhc3QgI3NoYWRvLXJvb3QgZnJhZ21lbnRzXG4gICAgICAgICAgICB3aGlsZSAoKHBhcmVudCA9IHBhcmVudC5ob3N0KSAmJiBpc0RvY0ZyYWcocGFyZW50KSkge31cblxuICAgICAgICAgICAgcmV0dXJuIHBhcmVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBwYXJlbnQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW5Db250ZXh0IChpbnRlcmFjdGFibGUsIGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZS5fY29udGV4dCA9PT0gZWxlbWVudC5vd25lckRvY3VtZW50XG4gICAgICAgICAgICAgICAgfHwgbm9kZUNvbnRhaW5zKGludGVyYWN0YWJsZS5fY29udGV4dCwgZWxlbWVudCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVzdElnbm9yZSAoaW50ZXJhY3RhYmxlLCBpbnRlcmFjdGFibGVFbGVtZW50LCBlbGVtZW50KSB7XG4gICAgICAgIHZhciBpZ25vcmVGcm9tID0gaW50ZXJhY3RhYmxlLm9wdGlvbnMuaWdub3JlRnJvbTtcblxuICAgICAgICBpZiAoIWlnbm9yZUZyb20gfHwgIWlzRWxlbWVudChlbGVtZW50KSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICBpZiAoaXNTdHJpbmcoaWdub3JlRnJvbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBtYXRjaGVzVXBUbyhlbGVtZW50LCBpZ25vcmVGcm9tLCBpbnRlcmFjdGFibGVFbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0VsZW1lbnQoaWdub3JlRnJvbSkpIHtcbiAgICAgICAgICAgIHJldHVybiBub2RlQ29udGFpbnMoaWdub3JlRnJvbSwgZWxlbWVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGVzdEFsbG93IChpbnRlcmFjdGFibGUsIGludGVyYWN0YWJsZUVsZW1lbnQsIGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGFsbG93RnJvbSA9IGludGVyYWN0YWJsZS5vcHRpb25zLmFsbG93RnJvbTtcblxuICAgICAgICBpZiAoIWFsbG93RnJvbSkgeyByZXR1cm4gdHJ1ZTsgfVxuXG4gICAgICAgIGlmICghaXNFbGVtZW50KGVsZW1lbnQpKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIGlmIChpc1N0cmluZyhhbGxvd0Zyb20pKSB7XG4gICAgICAgICAgICByZXR1cm4gbWF0Y2hlc1VwVG8oZWxlbWVudCwgYWxsb3dGcm9tLCBpbnRlcmFjdGFibGVFbGVtZW50KTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChpc0VsZW1lbnQoYWxsb3dGcm9tKSkge1xuICAgICAgICAgICAgcmV0dXJuIG5vZGVDb250YWlucyhhbGxvd0Zyb20sIGVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrQXhpcyAoYXhpcywgaW50ZXJhY3RhYmxlKSB7XG4gICAgICAgIGlmICghaW50ZXJhY3RhYmxlKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIHZhciB0aGlzQXhpcyA9IGludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcuYXhpcztcblxuICAgICAgICByZXR1cm4gKGF4aXMgPT09ICd4eScgfHwgdGhpc0F4aXMgPT09ICd4eScgfHwgdGhpc0F4aXMgPT09IGF4aXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrU25hcCAoaW50ZXJhY3RhYmxlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoL15yZXNpemUvLnRlc3QoYWN0aW9uKSkge1xuICAgICAgICAgICAgYWN0aW9uID0gJ3Jlc2l6ZSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gb3B0aW9uc1thY3Rpb25dLnNuYXAgJiYgb3B0aW9uc1thY3Rpb25dLnNuYXAuZW5hYmxlZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjaGVja1Jlc3RyaWN0IChpbnRlcmFjdGFibGUsIGFjdGlvbikge1xuICAgICAgICB2YXIgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zO1xuXG4gICAgICAgIGlmICgvXnJlc2l6ZS8udGVzdChhY3Rpb24pKSB7XG4gICAgICAgICAgICBhY3Rpb24gPSAncmVzaXplJztcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiAgb3B0aW9uc1thY3Rpb25dLnJlc3RyaWN0ICYmIG9wdGlvbnNbYWN0aW9uXS5yZXN0cmljdC5lbmFibGVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrQXV0b1Njcm9sbCAoaW50ZXJhY3RhYmxlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoL15yZXNpemUvLnRlc3QoYWN0aW9uKSkge1xuICAgICAgICAgICAgYWN0aW9uID0gJ3Jlc2l6ZSc7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gIG9wdGlvbnNbYWN0aW9uXS5hdXRvU2Nyb2xsICYmIG9wdGlvbnNbYWN0aW9uXS5hdXRvU2Nyb2xsLmVuYWJsZWQ7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gd2l0aGluSW50ZXJhY3Rpb25MaW1pdCAoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucyxcbiAgICAgICAgICAgIG1heEFjdGlvbnMgPSBvcHRpb25zW2FjdGlvbi5uYW1lXS5tYXgsXG4gICAgICAgICAgICBtYXhQZXJFbGVtZW50ID0gb3B0aW9uc1thY3Rpb24ubmFtZV0ubWF4UGVyRWxlbWVudCxcbiAgICAgICAgICAgIGFjdGl2ZUludGVyYWN0aW9ucyA9IDAsXG4gICAgICAgICAgICB0YXJnZXRDb3VudCA9IDAsXG4gICAgICAgICAgICB0YXJnZXRFbGVtZW50Q291bnQgPSAwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXSxcbiAgICAgICAgICAgICAgICBvdGhlckFjdGlvbiA9IGludGVyYWN0aW9uLnByZXBhcmVkLm5hbWUsXG4gICAgICAgICAgICAgICAgYWN0aXZlID0gaW50ZXJhY3Rpb24uaW50ZXJhY3RpbmcoKTtcblxuICAgICAgICAgICAgaWYgKCFhY3RpdmUpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgYWN0aXZlSW50ZXJhY3Rpb25zKys7XG5cbiAgICAgICAgICAgIGlmIChhY3RpdmVJbnRlcmFjdGlvbnMgPj0gbWF4SW50ZXJhY3Rpb25zKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24udGFyZ2V0ICE9PSBpbnRlcmFjdGFibGUpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgdGFyZ2V0Q291bnQgKz0gKG90aGVyQWN0aW9uID09PSBhY3Rpb24ubmFtZSl8MDtcblxuICAgICAgICAgICAgaWYgKHRhcmdldENvdW50ID49IG1heEFjdGlvbnMpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5lbGVtZW50ID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0RWxlbWVudENvdW50Kys7XG5cbiAgICAgICAgICAgICAgICBpZiAob3RoZXJBY3Rpb24gIT09IGFjdGlvbi5uYW1lIHx8IHRhcmdldEVsZW1lbnRDb3VudCA+PSBtYXhQZXJFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbWF4SW50ZXJhY3Rpb25zID4gMDtcbiAgICB9XG5cbiAgICAvLyBUZXN0IGZvciB0aGUgZWxlbWVudCB0aGF0J3MgXCJhYm92ZVwiIGFsbCBvdGhlciBxdWFsaWZpZXJzXG4gICAgZnVuY3Rpb24gaW5kZXhPZkRlZXBlc3RFbGVtZW50IChlbGVtZW50cykge1xuICAgICAgICB2YXIgZHJvcHpvbmUsXG4gICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGVsZW1lbnRzWzBdLFxuICAgICAgICAgICAgaW5kZXggPSBkZWVwZXN0Wm9uZT8gMDogLTEsXG4gICAgICAgICAgICBwYXJlbnQsXG4gICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHMgPSBbXSxcbiAgICAgICAgICAgIGRyb3B6b25lUGFyZW50cyA9IFtdLFxuICAgICAgICAgICAgY2hpbGQsXG4gICAgICAgICAgICBpLFxuICAgICAgICAgICAgbjtcblxuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgZWxlbWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGRyb3B6b25lID0gZWxlbWVudHNbaV07XG5cbiAgICAgICAgICAgIC8vIGFuIGVsZW1lbnQgbWlnaHQgYmVsb25nIHRvIG11bHRpcGxlIHNlbGVjdG9yIGRyb3B6b25lc1xuICAgICAgICAgICAgaWYgKCFkcm9wem9uZSB8fCBkcm9wem9uZSA9PT0gZGVlcGVzdFpvbmUpIHtcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKCFkZWVwZXN0Wm9uZSkge1xuICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lID0gZHJvcHpvbmU7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgZGVlcGVzdCBvciBjdXJyZW50IGFyZSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQgb3IgZG9jdW1lbnQucm9vdEVsZW1lbnRcbiAgICAgICAgICAgIC8vIC0gaWYgdGhlIGN1cnJlbnQgZHJvcHpvbmUgaXMsIGRvIG5vdGhpbmcgYW5kIGNvbnRpbnVlXG4gICAgICAgICAgICBpZiAoZHJvcHpvbmUucGFyZW50Tm9kZSA9PT0gZHJvcHpvbmUub3duZXJEb2N1bWVudCkge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gLSBpZiBkZWVwZXN0IGlzLCB1cGRhdGUgd2l0aCB0aGUgY3VycmVudCBkcm9wem9uZSBhbmQgY29udGludWUgdG8gbmV4dFxuICAgICAgICAgICAgZWxzZSBpZiAoZGVlcGVzdFpvbmUucGFyZW50Tm9kZSA9PT0gZHJvcHpvbmUub3duZXJEb2N1bWVudCkge1xuICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lID0gZHJvcHpvbmU7XG4gICAgICAgICAgICAgICAgaW5kZXggPSBpO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWRlZXBlc3Rab25lUGFyZW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkZWVwZXN0Wm9uZTtcbiAgICAgICAgICAgICAgICB3aGlsZSAocGFyZW50LnBhcmVudE5vZGUgJiYgcGFyZW50LnBhcmVudE5vZGUgIT09IHBhcmVudC5vd25lckRvY3VtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lUGFyZW50cy51bnNoaWZ0KHBhcmVudCk7XG4gICAgICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgdGhpcyBlbGVtZW50IGlzIGFuIHN2ZyBlbGVtZW50IGFuZCB0aGUgY3VycmVudCBkZWVwZXN0IGlzXG4gICAgICAgICAgICAvLyBhbiBIVE1MRWxlbWVudFxuICAgICAgICAgICAgaWYgKGRlZXBlc3Rab25lIGluc3RhbmNlb2YgSFRNTEVsZW1lbnRcbiAgICAgICAgICAgICAgICAmJiBkcm9wem9uZSBpbnN0YW5jZW9mIFNWR0VsZW1lbnRcbiAgICAgICAgICAgICAgICAmJiAhKGRyb3B6b25lIGluc3RhbmNlb2YgU1ZHU1ZHRWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChkcm9wem9uZSA9PT0gZGVlcGVzdFpvbmUucGFyZW50Tm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkcm9wem9uZS5vd25lclNWR0VsZW1lbnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBwYXJlbnQgPSBkcm9wem9uZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZHJvcHpvbmVQYXJlbnRzID0gW107XG5cbiAgICAgICAgICAgIHdoaWxlIChwYXJlbnQucGFyZW50Tm9kZSAhPT0gcGFyZW50Lm93bmVyRG9jdW1lbnQpIHtcbiAgICAgICAgICAgICAgICBkcm9wem9uZVBhcmVudHMudW5zaGlmdChwYXJlbnQpO1xuICAgICAgICAgICAgICAgIHBhcmVudCA9IHBhcmVudC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuID0gMDtcblxuICAgICAgICAgICAgLy8gZ2V0IChwb3NpdGlvbiBvZiBsYXN0IGNvbW1vbiBhbmNlc3RvcikgKyAxXG4gICAgICAgICAgICB3aGlsZSAoZHJvcHpvbmVQYXJlbnRzW25dICYmIGRyb3B6b25lUGFyZW50c1tuXSA9PT0gZGVlcGVzdFpvbmVQYXJlbnRzW25dKSB7XG4gICAgICAgICAgICAgICAgbisrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcGFyZW50cyA9IFtcbiAgICAgICAgICAgICAgICBkcm9wem9uZVBhcmVudHNbbiAtIDFdLFxuICAgICAgICAgICAgICAgIGRyb3B6b25lUGFyZW50c1tuXSxcbiAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZVBhcmVudHNbbl1cbiAgICAgICAgICAgIF07XG5cbiAgICAgICAgICAgIGNoaWxkID0gcGFyZW50c1swXS5sYXN0Q2hpbGQ7XG5cbiAgICAgICAgICAgIHdoaWxlIChjaGlsZCkge1xuICAgICAgICAgICAgICAgIGlmIChjaGlsZCA9PT0gcGFyZW50c1sxXSkge1xuICAgICAgICAgICAgICAgICAgICBkZWVwZXN0Wm9uZSA9IGRyb3B6b25lO1xuICAgICAgICAgICAgICAgICAgICBpbmRleCA9IGk7XG4gICAgICAgICAgICAgICAgICAgIGRlZXBlc3Rab25lUGFyZW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChjaGlsZCA9PT0gcGFyZW50c1syXSkge1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjaGlsZCA9IGNoaWxkLnByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBpbmRleDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBJbnRlcmFjdGlvbiAoKSB7XG4gICAgICAgIHRoaXMudGFyZ2V0ICAgICAgICAgID0gbnVsbDsgLy8gY3VycmVudCBpbnRlcmFjdGFibGUgYmVpbmcgaW50ZXJhY3RlZCB3aXRoXG4gICAgICAgIHRoaXMuZWxlbWVudCAgICAgICAgID0gbnVsbDsgLy8gdGhlIHRhcmdldCBlbGVtZW50IG9mIHRoZSBpbnRlcmFjdGFibGVcbiAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ICAgICAgPSBudWxsOyAvLyB0aGUgZHJvcHpvbmUgYSBkcmFnIHRhcmdldCBtaWdodCBiZSBkcm9wcGVkIGludG9cbiAgICAgICAgdGhpcy5kcm9wRWxlbWVudCAgICAgPSBudWxsOyAvLyB0aGUgZWxlbWVudCBhdCB0aGUgdGltZSBvZiBjaGVja2luZ1xuICAgICAgICB0aGlzLnByZXZEcm9wVGFyZ2V0ICA9IG51bGw7IC8vIHRoZSBkcm9wem9uZSB0aGF0IHdhcyByZWNlbnRseSBkcmFnZ2VkIGF3YXkgZnJvbVxuICAgICAgICB0aGlzLnByZXZEcm9wRWxlbWVudCA9IG51bGw7IC8vIHRoZSBlbGVtZW50IGF0IHRoZSB0aW1lIG9mIGNoZWNraW5nXG5cbiAgICAgICAgdGhpcy5wcmVwYXJlZCAgICAgICAgPSB7ICAgICAvLyBhY3Rpb24gdGhhdCdzIHJlYWR5IHRvIGJlIGZpcmVkIG9uIG5leHQgbW92ZSBldmVudFxuICAgICAgICAgICAgbmFtZSA6IG51bGwsXG4gICAgICAgICAgICBheGlzIDogbnVsbCxcbiAgICAgICAgICAgIGVkZ2VzOiBudWxsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5tYXRjaGVzICAgICAgICAgPSBbXTsgICAvLyBhbGwgc2VsZWN0b3JzIHRoYXQgYXJlIG1hdGNoZWQgYnkgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzICAgPSBbXTsgICAvLyBjb3JyZXNwb25kaW5nIGVsZW1lbnRzXG5cbiAgICAgICAgdGhpcy5pbmVydGlhU3RhdHVzID0ge1xuICAgICAgICAgICAgYWN0aXZlICAgICAgIDogZmFsc2UsXG4gICAgICAgICAgICBzbW9vdGhFbmQgICAgOiBmYWxzZSxcblxuICAgICAgICAgICAgc3RhcnRFdmVudDogbnVsbCxcbiAgICAgICAgICAgIHVwQ29vcmRzOiB7fSxcblxuICAgICAgICAgICAgeGU6IDAsIHllOiAwLFxuICAgICAgICAgICAgc3g6IDAsIHN5OiAwLFxuXG4gICAgICAgICAgICB0MDogMCxcbiAgICAgICAgICAgIHZ4MDogMCwgdnlzOiAwLFxuICAgICAgICAgICAgZHVyYXRpb246IDAsXG5cbiAgICAgICAgICAgIHJlc3VtZUR4OiAwLFxuICAgICAgICAgICAgcmVzdW1lRHk6IDAsXG5cbiAgICAgICAgICAgIGxhbWJkYV92MDogMCxcbiAgICAgICAgICAgIG9uZV92ZV92MDogMCxcbiAgICAgICAgICAgIGkgIDogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChpc0Z1bmN0aW9uKEZ1bmN0aW9uLnByb3RvdHlwZS5iaW5kKSkge1xuICAgICAgICAgICAgdGhpcy5ib3VuZEluZXJ0aWFGcmFtZSA9IHRoaXMuaW5lcnRpYUZyYW1lLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUgPSB0aGlzLnNtb290aEVuZEZyYW1lLmJpbmQodGhpcyk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgdGhhdCA9IHRoaXM7XG5cbiAgICAgICAgICAgIHRoaXMuYm91bmRJbmVydGlhRnJhbWUgPSBmdW5jdGlvbiAoKSB7IHJldHVybiB0aGF0LmluZXJ0aWFGcmFtZSgpOyB9O1xuICAgICAgICAgICAgdGhpcy5ib3VuZFNtb290aEVuZEZyYW1lID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gdGhhdC5zbW9vdGhFbmRGcmFtZSgpOyB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5hY3RpdmVEcm9wcyA9IHtcbiAgICAgICAgICAgIGRyb3B6b25lczogW10sICAgICAgLy8gdGhlIGRyb3B6b25lcyB0aGF0IGFyZSBtZW50aW9uZWQgYmVsb3dcbiAgICAgICAgICAgIGVsZW1lbnRzIDogW10sICAgICAgLy8gZWxlbWVudHMgb2YgZHJvcHpvbmVzIHRoYXQgYWNjZXB0IHRoZSB0YXJnZXQgZHJhZ2dhYmxlXG4gICAgICAgICAgICByZWN0cyAgICA6IFtdICAgICAgIC8vIHRoZSByZWN0cyBvZiB0aGUgZWxlbWVudHMgbWVudGlvbmVkIGFib3ZlXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8ga2VlcCB0cmFjayBvZiBhZGRlZCBwb2ludGVyc1xuICAgICAgICB0aGlzLnBvaW50ZXJzICAgID0gW107XG4gICAgICAgIHRoaXMucG9pbnRlcklkcyAgPSBbXTtcbiAgICAgICAgdGhpcy5kb3duVGFyZ2V0cyA9IFtdO1xuICAgICAgICB0aGlzLmRvd25UaW1lcyAgID0gW107XG4gICAgICAgIHRoaXMuaG9sZFRpbWVycyAgPSBbXTtcblxuICAgICAgICAvLyBQcmV2aW91cyBuYXRpdmUgcG9pbnRlciBtb3ZlIGV2ZW50IGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMucHJldkNvb3JkcyA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG4gICAgICAgIC8vIGN1cnJlbnQgbmF0aXZlIHBvaW50ZXIgbW92ZSBldmVudCBjb29yZGluYXRlc1xuICAgICAgICB0aGlzLmN1ckNvb3JkcyA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgLy8gU3RhcnRpbmcgSW50ZXJhY3RFdmVudCBwb2ludGVyIGNvb3JkaW5hdGVzXG4gICAgICAgIHRoaXMuc3RhcnRDb29yZHMgPSB7XG4gICAgICAgICAgICBwYWdlICAgICA6IHsgeDogMCwgeTogMCB9LFxuICAgICAgICAgICAgY2xpZW50ICAgOiB7IHg6IDAsIHk6IDAgfSxcbiAgICAgICAgICAgIHRpbWVTdGFtcDogMFxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIENoYW5nZSBpbiBjb29yZGluYXRlcyBhbmQgdGltZSBvZiB0aGUgcG9pbnRlclxuICAgICAgICB0aGlzLnBvaW50ZXJEZWx0YSA9IHtcbiAgICAgICAgICAgIHBhZ2UgICAgIDogeyB4OiAwLCB5OiAwLCB2eDogMCwgdnk6IDAsIHNwZWVkOiAwIH0sXG4gICAgICAgICAgICBjbGllbnQgICA6IHsgeDogMCwgeTogMCwgdng6IDAsIHZ5OiAwLCBzcGVlZDogMCB9LFxuICAgICAgICAgICAgdGltZVN0YW1wOiAwXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5kb3duRXZlbnQgICA9IG51bGw7ICAgIC8vIHBvaW50ZXJkb3duL21vdXNlZG93bi90b3VjaHN0YXJ0IGV2ZW50XG4gICAgICAgIHRoaXMuZG93blBvaW50ZXIgPSB7fTtcblxuICAgICAgICB0aGlzLl9ldmVudFRhcmdldCAgICA9IG51bGw7XG4gICAgICAgIHRoaXMuX2N1ckV2ZW50VGFyZ2V0ID0gbnVsbDtcblxuICAgICAgICB0aGlzLnByZXZFdmVudCA9IG51bGw7ICAgICAgLy8gcHJldmlvdXMgYWN0aW9uIGV2ZW50XG4gICAgICAgIHRoaXMudGFwVGltZSAgID0gMDsgICAgICAgICAvLyB0aW1lIG9mIHRoZSBtb3N0IHJlY2VudCB0YXAgZXZlbnRcbiAgICAgICAgdGhpcy5wcmV2VGFwICAgPSBudWxsO1xuXG4gICAgICAgIHRoaXMuc3RhcnRPZmZzZXQgICAgPSB7IGxlZnQ6IDAsIHJpZ2h0OiAwLCB0b3A6IDAsIGJvdHRvbTogMCB9O1xuICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0ID0geyBsZWZ0OiAwLCByaWdodDogMCwgdG9wOiAwLCBib3R0b206IDAgfTtcbiAgICAgICAgdGhpcy5zbmFwT2Zmc2V0cyAgICA9IFtdO1xuXG4gICAgICAgIHRoaXMuZ2VzdHVyZSA9IHtcbiAgICAgICAgICAgIHN0YXJ0OiB7IHg6IDAsIHk6IDAgfSxcblxuICAgICAgICAgICAgc3RhcnREaXN0YW5jZTogMCwgICAvLyBkaXN0YW5jZSBiZXR3ZWVuIHR3byB0b3VjaGVzIG9mIHRvdWNoU3RhcnRcbiAgICAgICAgICAgIHByZXZEaXN0YW5jZSA6IDAsXG4gICAgICAgICAgICBkaXN0YW5jZSAgICAgOiAwLFxuXG4gICAgICAgICAgICBzY2FsZTogMSwgICAgICAgICAgIC8vIGdlc3R1cmUuZGlzdGFuY2UgLyBnZXN0dXJlLnN0YXJ0RGlzdGFuY2VcblxuICAgICAgICAgICAgc3RhcnRBbmdsZTogMCwgICAgICAvLyBhbmdsZSBvZiBsaW5lIGpvaW5pbmcgdHdvIHRvdWNoZXNcbiAgICAgICAgICAgIHByZXZBbmdsZSA6IDAgICAgICAgLy8gYW5nbGUgb2YgdGhlIHByZXZpb3VzIGdlc3R1cmUgZXZlbnRcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnNuYXBTdGF0dXMgPSB7XG4gICAgICAgICAgICB4ICAgICAgIDogMCwgeSAgICAgICA6IDAsXG4gICAgICAgICAgICBkeCAgICAgIDogMCwgZHkgICAgICA6IDAsXG4gICAgICAgICAgICByZWFsWCAgIDogMCwgcmVhbFkgICA6IDAsXG4gICAgICAgICAgICBzbmFwcGVkWDogMCwgc25hcHBlZFk6IDAsXG4gICAgICAgICAgICB0YXJnZXRzIDogW10sXG4gICAgICAgICAgICBsb2NrZWQgIDogZmFsc2UsXG4gICAgICAgICAgICBjaGFuZ2VkIDogZmFsc2VcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJlc3RyaWN0U3RhdHVzID0ge1xuICAgICAgICAgICAgZHggICAgICAgICA6IDAsIGR5ICAgICAgICAgOiAwLFxuICAgICAgICAgICAgcmVzdHJpY3RlZFg6IDAsIHJlc3RyaWN0ZWRZOiAwLFxuICAgICAgICAgICAgc25hcCAgICAgICA6IG51bGwsXG4gICAgICAgICAgICByZXN0cmljdGVkIDogZmFsc2UsXG4gICAgICAgICAgICBjaGFuZ2VkICAgIDogZmFsc2VcbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLnJlc3RyaWN0U3RhdHVzLnNuYXAgPSB0aGlzLnNuYXBTdGF0dXM7XG5cbiAgICAgICAgdGhpcy5wb2ludGVySXNEb3duICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5wb2ludGVyV2FzTW92ZWQgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5nZXN0dXJpbmcgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5kcmFnZ2luZyAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZXNpemluZyAgICAgICAgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5yZXNpemVBeGVzICAgICAgPSAneHknO1xuXG4gICAgICAgIHRoaXMubW91c2UgPSBmYWxzZTtcblxuICAgICAgICBpbnRlcmFjdGlvbnMucHVzaCh0aGlzKTtcbiAgICB9XG5cbiAgICBJbnRlcmFjdGlvbi5wcm90b3R5cGUgPSB7XG4gICAgICAgIGdldFBhZ2VYWSAgOiBmdW5jdGlvbiAocG9pbnRlciwgeHkpIHsgcmV0dXJuICAgZ2V0UGFnZVhZKHBvaW50ZXIsIHh5LCB0aGlzKTsgfSxcbiAgICAgICAgZ2V0Q2xpZW50WFk6IGZ1bmN0aW9uIChwb2ludGVyLCB4eSkgeyByZXR1cm4gZ2V0Q2xpZW50WFkocG9pbnRlciwgeHksIHRoaXMpOyB9LFxuICAgICAgICBzZXRFdmVudFhZIDogZnVuY3Rpb24gKHRhcmdldCwgcHRyKSB7IHJldHVybiAgc2V0RXZlbnRYWSh0YXJnZXQsIHB0ciwgdGhpcyk7IH0sXG5cbiAgICAgICAgcG9pbnRlck92ZXI6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLm5hbWUgfHwgIXRoaXMubW91c2UpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHZhciBjdXJNYXRjaGVzID0gW10sXG4gICAgICAgICAgICAgICAgY3VyTWF0Y2hFbGVtZW50cyA9IFtdLFxuICAgICAgICAgICAgICAgIHByZXZUYXJnZXRFbGVtZW50ID0gdGhpcy5lbGVtZW50O1xuXG4gICAgICAgICAgICB0aGlzLmFkZFBvaW50ZXIocG9pbnRlcik7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldFxuICAgICAgICAgICAgICAgICYmICh0ZXN0SWdub3JlKHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICB8fCAhdGVzdEFsbG93KHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQsIGV2ZW50VGFyZ2V0KSkpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGUgZXZlbnRUYXJnZXQgc2hvdWxkIGJlIGlnbm9yZWQgb3Igc2hvdWxkbid0IGJlIGFsbG93ZWRcbiAgICAgICAgICAgICAgICAvLyBjbGVhciB0aGUgcHJldmlvdXMgdGFyZ2V0XG4gICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBudWxsO1xuICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBlbGVtZW50SW50ZXJhY3RhYmxlID0gaW50ZXJhY3RhYmxlcy5nZXQoZXZlbnRUYXJnZXQpLFxuICAgICAgICAgICAgICAgIGVsZW1lbnRBY3Rpb24gPSAoZWxlbWVudEludGVyYWN0YWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIXRlc3RJZ25vcmUoZWxlbWVudEludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGVsZW1lbnRJbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHZhbGlkYXRlQWN0aW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnRJbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHBvaW50ZXIsIHRoaXMsIGV2ZW50VGFyZ2V0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50SW50ZXJhY3RhYmxlKSk7XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50QWN0aW9uICYmICF3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KGVsZW1lbnRJbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBlbGVtZW50QWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICBlbGVtZW50QWN0aW9uID0gbnVsbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZnVuY3Rpb24gcHVzaEN1ck1hdGNoZXMgKGludGVyYWN0YWJsZSwgc2VsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICYmIGluQ29udGV4dChpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGV2ZW50VGFyZ2V0LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgdGVzdEFsbG93KGludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBtYXRjaGVzU2VsZWN0b3IoZXZlbnRUYXJnZXQsIHNlbGVjdG9yKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGN1ck1hdGNoZXMucHVzaChpbnRlcmFjdGFibGUpO1xuICAgICAgICAgICAgICAgICAgICBjdXJNYXRjaEVsZW1lbnRzLnB1c2goZXZlbnRUYXJnZXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGVsZW1lbnRBY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IGVsZW1lbnRJbnRlcmFjdGFibGU7XG4gICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaGVzID0gW107XG4gICAgICAgICAgICAgICAgdGhpcy5tYXRjaEVsZW1lbnRzID0gW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvcihwdXNoQ3VyTWF0Y2hlcyk7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy52YWxpZGF0ZVNlbGVjdG9yKHBvaW50ZXIsIGN1ck1hdGNoZXMsIGN1ck1hdGNoRWxlbWVudHMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hlcyA9IGN1ck1hdGNoZXM7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyA9IGN1ck1hdGNoRWxlbWVudHM7XG5cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb2ludGVySG92ZXIocG9pbnRlciwgZXZlbnQsIHRoaXMubWF0Y2hlcywgdGhpcy5tYXRjaEVsZW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZChldmVudFRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb2ludGVyRXZlbnQ/IHBFdmVudFR5cGVzLm1vdmUgOiAnbW91c2Vtb3ZlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAodGhpcy50YXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGVDb250YWlucyhwcmV2VGFyZ2V0RWxlbWVudCwgZXZlbnRUYXJnZXQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJIb3Zlcihwb2ludGVyLCBldmVudCwgdGhpcy5tYXRjaGVzLCB0aGlzLm1hdGNoRWxlbWVudHMpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLmVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFBvaW50ZXJFdmVudD8gcEV2ZW50VHlwZXMubW92ZSA6ICdtb3VzZW1vdmUnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0ID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm1hdGNoZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyA9IFtdO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIENoZWNrIHdoYXQgYWN0aW9uIHdvdWxkIGJlIHBlcmZvcm1lZCBvbiBwb2ludGVyTW92ZSB0YXJnZXQgaWYgYSBtb3VzZVxuICAgICAgICAvLyBidXR0b24gd2VyZSBwcmVzc2VkIGFuZCBjaGFuZ2UgdGhlIGN1cnNvciBhY2NvcmRpbmdseVxuICAgICAgICBwb2ludGVySG92ZXI6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0LCBtYXRjaGVzLCBtYXRjaEVsZW1lbnRzKSB7XG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQ7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lICYmIHRoaXMubW91c2UpIHtcblxuICAgICAgICAgICAgICAgIHZhciBhY3Rpb247XG5cbiAgICAgICAgICAgICAgICAvLyB1cGRhdGUgcG9pbnRlciBjb29yZHMgZm9yIGRlZmF1bHRBY3Rpb25DaGVja2VyIHRvIHVzZVxuICAgICAgICAgICAgICAgIHRoaXMuc2V0RXZlbnRYWSh0aGlzLmN1ckNvb3JkcywgcG9pbnRlcik7XG5cbiAgICAgICAgICAgICAgICBpZiAobWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSB0aGlzLnZhbGlkYXRlU2VsZWN0b3IocG9pbnRlciwgbWF0Y2hlcywgbWF0Y2hFbGVtZW50cyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSB2YWxpZGF0ZUFjdGlvbih0YXJnZXQuZ2V0QWN0aW9uKHRoaXMucG9pbnRlcnNbMF0sIHRoaXMsIHRoaXMuZWxlbWVudCksIHRoaXMudGFyZ2V0KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAodGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSBnZXRBY3Rpb25DdXJzb3IoYWN0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMucHJlcGFyZWQubmFtZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHBvaW50ZXJPdXQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXBhcmVkLm5hbWUpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIC8vIFJlbW92ZSB0ZW1wb3JhcnkgZXZlbnQgbGlzdGVuZXJzIGZvciBzZWxlY3RvciBJbnRlcmFjdGFibGVzXG4gICAgICAgICAgICBpZiAoIWludGVyYWN0YWJsZXMuZ2V0KGV2ZW50VGFyZ2V0KSkge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUoZXZlbnRUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBQb2ludGVyRXZlbnQ/IHBFdmVudFR5cGVzLm1vdmUgOiAnbW91c2Vtb3ZlJyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVycy5wb2ludGVySG92ZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy50YXJnZXQgJiYgdGhpcy50YXJnZXQub3B0aW9ucy5zdHlsZUN1cnNvciAmJiAhdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy50YXJnZXQuX2RvYy5kb2N1bWVudEVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJyc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2VsZWN0b3JEb3duOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHRoYXQgPSB0aGlzLFxuICAgICAgICAgICAgICAgIC8vIGNvcHkgZXZlbnQgdG8gYmUgdXNlZCBpbiB0aW1lb3V0IGZvciBJRThcbiAgICAgICAgICAgICAgICBldmVudENvcHkgPSBldmVudHMudXNlQXR0YWNoRXZlbnQ/IGV4dGVuZCh7fSwgZXZlbnQpIDogZXZlbnQsXG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IGV2ZW50VGFyZ2V0LFxuICAgICAgICAgICAgICAgIHBvaW50ZXJJbmRleCA9IHRoaXMuYWRkUG9pbnRlcihwb2ludGVyKSxcbiAgICAgICAgICAgICAgICBhY3Rpb247XG5cbiAgICAgICAgICAgIHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdID0gc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdGhhdC5wb2ludGVySG9sZChldmVudHMudXNlQXR0YWNoRXZlbnQ/IGV2ZW50Q29weSA6IHBvaW50ZXIsIGV2ZW50Q29weSwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcbiAgICAgICAgICAgIH0sIGRlZmF1bHRPcHRpb25zLl9ob2xkRHVyYXRpb24pO1xuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJJc0Rvd24gPSB0cnVlO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiB0aGUgZG93biBldmVudCBoaXRzIHRoZSBjdXJyZW50IGluZXJ0aWEgdGFyZ2V0XG4gICAgICAgICAgICBpZiAodGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSAmJiB0aGlzLnRhcmdldC5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIC8vIGNsaW1iIHVwIHRoZSBET00gdHJlZSBmcm9tIHRoZSBldmVudCB0YXJnZXRcbiAgICAgICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBlbGVtZW50IGlzIHRoZSBjdXJyZW50IGluZXJ0aWEgdGFyZ2V0IGVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQgPT09IHRoaXMuZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYW5kIHRoZSBwcm9zcGVjdGl2ZSBhY3Rpb24gaXMgdGhlIHNhbWUgYXMgdGhlIG9uZ29pbmcgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiB2YWxpZGF0ZUFjdGlvbih0aGlzLnRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgdGhpcywgdGhpcy5lbGVtZW50KSwgdGhpcy50YXJnZXQpLm5hbWUgPT09IHRoaXMucHJlcGFyZWQubmFtZSkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBzdG9wIGluZXJ0aWEgc28gdGhhdCB0aGUgbmV4dCBtb3ZlIHdpbGwgYmUgYSBub3JtYWwgb25lXG4gICAgICAgICAgICAgICAgICAgICAgICBjYW5jZWxGcmFtZSh0aGlzLmluZXJ0aWFTdGF0dXMuaSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmluZXJ0aWFTdGF0dXMuYWN0aXZlID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdkb3duJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkbyBub3RoaW5nIGlmIGludGVyYWN0aW5nXG4gICAgICAgICAgICBpZiAodGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2Rvd24nKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZ1bmN0aW9uIHB1c2hNYXRjaGVzIChpbnRlcmFjdGFibGUsIHNlbGVjdG9yLCBjb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gaWU4TWF0Y2hlc1NlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgID8gY29udGV4dC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgICAgIGlmIChpbkNvbnRleHQoaW50ZXJhY3RhYmxlLCBlbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBlbGVtZW50LCBldmVudFRhcmdldClcbiAgICAgICAgICAgICAgICAgICAgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yLCBlbGVtZW50cykpIHtcblxuICAgICAgICAgICAgICAgICAgICB0aGF0Lm1hdGNoZXMucHVzaChpbnRlcmFjdGFibGUpO1xuICAgICAgICAgICAgICAgICAgICB0aGF0Lm1hdGNoRWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBwb2ludGVyIGNvb3JkcyBmb3IgZGVmYXVsdEFjdGlvbkNoZWNrZXIgdG8gdXNlXG4gICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5jdXJDb29yZHMsIHBvaW50ZXIpO1xuXG4gICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpICYmICFhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoZXMgPSBbXTtcbiAgICAgICAgICAgICAgICB0aGlzLm1hdGNoRWxlbWVudHMgPSBbXTtcblxuICAgICAgICAgICAgICAgIGludGVyYWN0YWJsZXMuZm9yRWFjaFNlbGVjdG9yKHB1c2hNYXRjaGVzKTtcblxuICAgICAgICAgICAgICAgIGFjdGlvbiA9IHRoaXMudmFsaWRhdGVTZWxlY3Rvcihwb2ludGVyLCB0aGlzLm1hdGNoZXMsIHRoaXMubWF0Y2hFbGVtZW50cyk7XG4gICAgICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgID0gYWN0aW9uLm5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5heGlzICA9IGFjdGlvbi5heGlzO1xuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuZWRnZXMgPSBhY3Rpb24uZWRnZXM7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnZG93bicpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMucG9pbnRlckRvd24ocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgYWN0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIGRvIHRoZXNlIG5vdyBzaW5jZSBwb2ludGVyRG93biBpc24ndCBiZWluZyBjYWxsZWQgZnJvbSBoZXJlXG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGltZXNbcG9pbnRlckluZGV4XSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZG93blRhcmdldHNbcG9pbnRlckluZGV4XSA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuZG93bkV2ZW50ID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgZXh0ZW5kKHRoaXMuZG93blBvaW50ZXIsIHBvaW50ZXIpO1xuXG4gICAgICAgICAgICAgICAgY29weUNvb3Jkcyh0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJXYXNNb3ZlZCA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLmNvbGxlY3RFdmVudFRhcmdldHMocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCAnZG93bicpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8vIERldGVybWluZSBhY3Rpb24gdG8gYmUgcGVyZm9ybWVkIG9uIG5leHQgcG9pbnRlck1vdmUgYW5kIGFkZCBhcHByb3ByaWF0ZVxuICAgICAgICAvLyBzdHlsZSBhbmQgZXZlbnQgTGlzdGVuZXJzXG4gICAgICAgIHBvaW50ZXJEb3duOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCwgZm9yY2VBY3Rpb24pIHtcbiAgICAgICAgICAgIGlmICghZm9yY2VBY3Rpb24gJiYgIXRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUgJiYgdGhpcy5wb2ludGVyV2FzTW92ZWQgJiYgdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVySXNEb3duID0gdHJ1ZTtcblxuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMuYWRkUG9pbnRlcihwb2ludGVyKSxcbiAgICAgICAgICAgICAgICBhY3Rpb247XG5cbiAgICAgICAgICAgIC8vIElmIGl0IGlzIHRoZSBzZWNvbmQgdG91Y2ggb2YgYSBtdWx0aS10b3VjaCBnZXN0dXJlLCBrZWVwIHRoZSB0YXJnZXRcbiAgICAgICAgICAgIC8vIHRoZSBzYW1lIGlmIGEgdGFyZ2V0IHdhcyBzZXQgYnkgdGhlIGZpcnN0IHRvdWNoXG4gICAgICAgICAgICAvLyBPdGhlcndpc2UsIHNldCB0aGUgdGFyZ2V0IGlmIHRoZXJlIGlzIG5vIGFjdGlvbiBwcmVwYXJlZFxuICAgICAgICAgICAgaWYgKCh0aGlzLnBvaW50ZXJJZHMubGVuZ3RoIDwgMiAmJiAhdGhpcy50YXJnZXQpIHx8ICF0aGlzLnByZXBhcmVkLm5hbWUpIHtcblxuICAgICAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGVzLmdldChjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgICAgICYmICF0ZXN0SWdub3JlKGludGVyYWN0YWJsZSwgY3VyRXZlbnRUYXJnZXQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiB0ZXN0QWxsb3coaW50ZXJhY3RhYmxlLCBjdXJFdmVudFRhcmdldCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIChhY3Rpb24gPSB2YWxpZGF0ZUFjdGlvbihmb3JjZUFjdGlvbiB8fCBpbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHBvaW50ZXIsIHRoaXMsIGN1ckV2ZW50VGFyZ2V0KSwgaW50ZXJhY3RhYmxlLCBldmVudFRhcmdldCkpXG4gICAgICAgICAgICAgICAgICAgICYmIHdpdGhpbkludGVyYWN0aW9uTGltaXQoaW50ZXJhY3RhYmxlLCBjdXJFdmVudFRhcmdldCwgYWN0aW9uKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IGludGVyYWN0YWJsZTtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gY3VyRXZlbnRUYXJnZXQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHRhcmdldCAmJiB0YXJnZXQub3B0aW9ucztcblxuICAgICAgICAgICAgaWYgKHRhcmdldCAmJiAhdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgYWN0aW9uID0gYWN0aW9uIHx8IHZhbGlkYXRlQWN0aW9uKGZvcmNlQWN0aW9uIHx8IHRhcmdldC5nZXRBY3Rpb24ocG9pbnRlciwgdGhpcywgY3VyRXZlbnRUYXJnZXQpLCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldEV2ZW50WFkodGhpcy5zdGFydENvb3Jkcyk7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWFjdGlvbikgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIGlmIChvcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSBnZXRBY3Rpb25DdXJzb3IoYWN0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLnJlc2l6ZUF4ZXMgPSBhY3Rpb24ubmFtZSA9PT0gJ3Jlc2l6ZSc/IGFjdGlvbi5heGlzIDogbnVsbDtcblxuICAgICAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdnZXN0dXJlJyAmJiB0aGlzLnBvaW50ZXJJZHMubGVuZ3RoIDwgMikge1xuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSBudWxsO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSAgPSBhY3Rpb24ubmFtZTtcbiAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLmF4aXMgID0gYWN0aW9uLmF4aXM7XG4gICAgICAgICAgICAgICAgdGhpcy5wcmVwYXJlZC5lZGdlcyA9IGFjdGlvbi5lZGdlcztcblxuICAgICAgICAgICAgICAgIHRoaXMuc25hcFN0YXR1cy5zbmFwcGVkWCA9IHRoaXMuc25hcFN0YXR1cy5zbmFwcGVkWSA9XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZFggPSB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWRZID0gTmFOO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGltZXNbcG9pbnRlckluZGV4XSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICAgICAgICAgICAgICAgIHRoaXMuZG93blRhcmdldHNbcG9pbnRlckluZGV4XSA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuZG93bkV2ZW50ID0gZXZlbnQ7XG4gICAgICAgICAgICAgICAgZXh0ZW5kKHRoaXMuZG93blBvaW50ZXIsIHBvaW50ZXIpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMucHJldkNvb3Jkcyk7XG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyV2FzTW92ZWQgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gaWYgaW5lcnRpYSBpcyBhY3RpdmUgdHJ5IHRvIHJlc3VtZSBhY3Rpb25cbiAgICAgICAgICAgIGVsc2UgaWYgKHRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmVcbiAgICAgICAgICAgICAgICAmJiBjdXJFdmVudFRhcmdldCA9PT0gdGhpcy5lbGVtZW50XG4gICAgICAgICAgICAgICAgJiYgdmFsaWRhdGVBY3Rpb24odGFyZ2V0LmdldEFjdGlvbihwb2ludGVyLCB0aGlzLCB0aGlzLmVsZW1lbnQpLCB0YXJnZXQpLm5hbWUgPT09IHRoaXMucHJlcGFyZWQubmFtZSkge1xuXG4gICAgICAgICAgICAgICAgY2FuY2VsRnJhbWUodGhpcy5pbmVydGlhU3RhdHVzLmkpO1xuICAgICAgICAgICAgICAgIHRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSBmYWxzZTtcblxuICAgICAgICAgICAgICAgIHRoaXMuY2hlY2tBbmRQcmV2ZW50RGVmYXVsdChldmVudCwgdGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldE1vZGlmaWNhdGlvbnM6IGZ1bmN0aW9uIChjb29yZHMsIHByZUVuZCkge1xuICAgICAgICAgICAgdmFyIHRhcmdldCAgICAgICAgID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgc2hvdWxkTW92ZSAgICAgPSB0cnVlLFxuICAgICAgICAgICAgICAgIHNob3VsZFNuYXAgICAgID0gY2hlY2tTbmFwKHRhcmdldCwgdGhpcy5wcmVwYXJlZC5uYW1lKSAgICAgJiYgKCF0YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnNuYXAuZW5kT25seSAgICAgfHwgcHJlRW5kKSxcbiAgICAgICAgICAgICAgICBzaG91bGRSZXN0cmljdCA9IGNoZWNrUmVzdHJpY3QodGFyZ2V0LCB0aGlzLnByZXBhcmVkLm5hbWUpICYmICghdGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5yZXN0cmljdC5lbmRPbmx5IHx8IHByZUVuZCk7XG5cbiAgICAgICAgICAgIGlmIChzaG91bGRTbmFwICAgICkgeyB0aGlzLnNldFNuYXBwaW5nICAgKGNvb3Jkcyk7IH0gZWxzZSB7IHRoaXMuc25hcFN0YXR1cyAgICAubG9ja2VkICAgICA9IGZhbHNlOyB9XG4gICAgICAgICAgICBpZiAoc2hvdWxkUmVzdHJpY3QpIHsgdGhpcy5zZXRSZXN0cmljdGlvbihjb29yZHMpOyB9IGVsc2UgeyB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWQgPSBmYWxzZTsgfVxuXG4gICAgICAgICAgICBpZiAoc2hvdWxkU25hcCAmJiB0aGlzLnNuYXBTdGF0dXMubG9ja2VkICYmICF0aGlzLnNuYXBTdGF0dXMuY2hhbmdlZCkge1xuICAgICAgICAgICAgICAgIHNob3VsZE1vdmUgPSBzaG91bGRSZXN0cmljdCAmJiB0aGlzLnJlc3RyaWN0U3RhdHVzLnJlc3RyaWN0ZWQgJiYgdGhpcy5yZXN0cmljdFN0YXR1cy5jaGFuZ2VkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoc2hvdWxkUmVzdHJpY3QgJiYgdGhpcy5yZXN0cmljdFN0YXR1cy5yZXN0cmljdGVkICYmICF0aGlzLnJlc3RyaWN0U3RhdHVzLmNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICBzaG91bGRNb3ZlID0gZmFsc2U7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBzaG91bGRNb3ZlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldFN0YXJ0T2Zmc2V0czogZnVuY3Rpb24gKGFjdGlvbiwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgcmVjdCA9IGludGVyYWN0YWJsZS5nZXRSZWN0KGVsZW1lbnQpLFxuICAgICAgICAgICAgICAgIG9yaWdpbiA9IGdldE9yaWdpblhZKGludGVyYWN0YWJsZSwgZWxlbWVudCksXG4gICAgICAgICAgICAgICAgc25hcCA9IGludGVyYWN0YWJsZS5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uc25hcCxcbiAgICAgICAgICAgICAgICByZXN0cmljdCA9IGludGVyYWN0YWJsZS5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QsXG4gICAgICAgICAgICAgICAgd2lkdGgsIGhlaWdodDtcblxuICAgICAgICAgICAgaWYgKHJlY3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0T2Zmc2V0LmxlZnQgPSB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueCAtIHJlY3QubGVmdDtcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXJ0T2Zmc2V0LnRvcCAgPSB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueSAtIHJlY3QudG9wO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5zdGFydE9mZnNldC5yaWdodCAgPSByZWN0LnJpZ2h0ICAtIHRoaXMuc3RhcnRDb29yZHMucGFnZS54O1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRPZmZzZXQuYm90dG9tID0gcmVjdC5ib3R0b20gLSB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueTtcblxuICAgICAgICAgICAgICAgIGlmICgnd2lkdGgnIGluIHJlY3QpIHsgd2lkdGggPSByZWN0LndpZHRoOyB9XG4gICAgICAgICAgICAgICAgZWxzZSB7IHdpZHRoID0gcmVjdC5yaWdodCAtIHJlY3QubGVmdDsgfVxuICAgICAgICAgICAgICAgIGlmICgnaGVpZ2h0JyBpbiByZWN0KSB7IGhlaWdodCA9IHJlY3QuaGVpZ2h0OyB9XG4gICAgICAgICAgICAgICAgZWxzZSB7IGhlaWdodCA9IHJlY3QuYm90dG9tIC0gcmVjdC50b3A7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RhcnRPZmZzZXQubGVmdCA9IHRoaXMuc3RhcnRPZmZzZXQudG9wID0gdGhpcy5zdGFydE9mZnNldC5yaWdodCA9IHRoaXMuc3RhcnRPZmZzZXQuYm90dG9tID0gMDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5zbmFwT2Zmc2V0cy5zcGxpY2UoMCk7XG5cbiAgICAgICAgICAgIHZhciBzbmFwT2Zmc2V0ID0gc25hcCAmJiBzbmFwLm9mZnNldCA9PT0gJ3N0YXJ0Q29vcmRzJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHg6IHRoaXMuc3RhcnRDb29yZHMucGFnZS54IC0gb3JpZ2luLngsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB5OiB0aGlzLnN0YXJ0Q29vcmRzLnBhZ2UueSAtIG9yaWdpbi55XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBzbmFwICYmIHNuYXAub2Zmc2V0IHx8IHsgeDogMCwgeTogMCB9O1xuXG4gICAgICAgICAgICBpZiAocmVjdCAmJiBzbmFwICYmIHNuYXAucmVsYXRpdmVQb2ludHMgJiYgc25hcC5yZWxhdGl2ZVBvaW50cy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNuYXAucmVsYXRpdmVQb2ludHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zbmFwT2Zmc2V0cy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHg6IHRoaXMuc3RhcnRPZmZzZXQubGVmdCAtICh3aWR0aCAgKiBzbmFwLnJlbGF0aXZlUG9pbnRzW2ldLngpICsgc25hcE9mZnNldC54LFxuICAgICAgICAgICAgICAgICAgICAgICAgeTogdGhpcy5zdGFydE9mZnNldC50b3AgIC0gKGhlaWdodCAqIHNuYXAucmVsYXRpdmVQb2ludHNbaV0ueSkgKyBzbmFwT2Zmc2V0LnlcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zbmFwT2Zmc2V0cy5wdXNoKHNuYXBPZmZzZXQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAocmVjdCAmJiByZXN0cmljdC5lbGVtZW50UmVjdCkge1xuICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQubGVmdCA9IHRoaXMuc3RhcnRPZmZzZXQubGVmdCAtICh3aWR0aCAgKiByZXN0cmljdC5lbGVtZW50UmVjdC5sZWZ0KTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlc3RyaWN0T2Zmc2V0LnRvcCAgPSB0aGlzLnN0YXJ0T2Zmc2V0LnRvcCAgLSAoaGVpZ2h0ICogcmVzdHJpY3QuZWxlbWVudFJlY3QudG9wKTtcblxuICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQucmlnaHQgID0gdGhpcy5zdGFydE9mZnNldC5yaWdodCAgLSAod2lkdGggICogKDEgLSByZXN0cmljdC5lbGVtZW50UmVjdC5yaWdodCkpO1xuICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQuYm90dG9tID0gdGhpcy5zdGFydE9mZnNldC5ib3R0b20gLSAoaGVpZ2h0ICogKDEgLSByZXN0cmljdC5lbGVtZW50UmVjdC5ib3R0b20pKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucmVzdHJpY3RPZmZzZXQubGVmdCA9IHRoaXMucmVzdHJpY3RPZmZzZXQudG9wID0gdGhpcy5yZXN0cmljdE9mZnNldC5yaWdodCA9IHRoaXMucmVzdHJpY3RPZmZzZXQuYm90dG9tID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0aW9uLnN0YXJ0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFN0YXJ0IGFuIGFjdGlvbiB3aXRoIHRoZSBnaXZlbiBJbnRlcmFjdGFibGUgYW5kIEVsZW1lbnQgYXMgdGFydGdldHMuIFRoZVxuICAgICAgICAgKiBhY3Rpb24gbXVzdCBiZSBlbmFibGVkIGZvciB0aGUgdGFyZ2V0IEludGVyYWN0YWJsZSBhbmQgYW4gYXBwcm9wcmlhdGUgbnVtYmVyXG4gICAgICAgICAqIG9mIHBvaW50ZXJzIG11c3QgYmUgaGVsZCBkb3duIOKAkyAxIGZvciBkcmFnL3Jlc2l6ZSwgMiBmb3IgZ2VzdHVyZS5cbiAgICAgICAgICpcbiAgICAgICAgICogVXNlIGl0IHdpdGggYGludGVyYWN0YWJsZS48YWN0aW9uPmFibGUoeyBtYW51YWxTdGFydDogZmFsc2UgfSlgIHRvIGFsd2F5c1xuICAgICAgICAgKiBbc3RhcnQgYWN0aW9ucyBtYW51YWxseV0oaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvaXNzdWVzLzExNClcbiAgICAgICAgICpcbiAgICAgICAgIC0gYWN0aW9uICAgICAgIChvYmplY3QpICBUaGUgYWN0aW9uIHRvIGJlIHBlcmZvcm1lZCAtIGRyYWcsIHJlc2l6ZSwgZXRjLlxuICAgICAgICAgLSBpbnRlcmFjdGFibGUgKEludGVyYWN0YWJsZSkgVGhlIEludGVyYWN0YWJsZSB0byB0YXJnZXRcbiAgICAgICAgIC0gZWxlbWVudCAgICAgIChFbGVtZW50KSBUaGUgRE9NIEVsZW1lbnQgdG8gdGFyZ2V0XG4gICAgICAgICA9IChvYmplY3QpIGludGVyYWN0XG4gICAgICAgICAqKlxuICAgICAgICAgfCBpbnRlcmFjdCh0YXJnZXQpXG4gICAgICAgICB8ICAgLmRyYWdnYWJsZSh7XG4gICAgICAgICB8ICAgICAvLyBkaXNhYmxlIHRoZSBkZWZhdWx0IGRyYWcgc3RhcnQgYnkgZG93bi0+bW92ZVxuICAgICAgICAgfCAgICAgbWFudWFsU3RhcnQ6IHRydWVcbiAgICAgICAgIHwgICB9KVxuICAgICAgICAgfCAgIC8vIHN0YXJ0IGRyYWdnaW5nIGFmdGVyIHRoZSB1c2VyIGhvbGRzIHRoZSBwb2ludGVyIGRvd25cbiAgICAgICAgIHwgICAub24oJ2hvbGQnLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgIHwgICAgIHZhciBpbnRlcmFjdGlvbiA9IGV2ZW50LmludGVyYWN0aW9uO1xuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgaWYgKCFpbnRlcmFjdGlvbi5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICB8ICAgICAgIGludGVyYWN0aW9uLnN0YXJ0KHsgbmFtZTogJ2RyYWcnIH0sXG4gICAgICAgICB8ICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQuY3VycmVudFRhcmdldCk7XG4gICAgICAgICB8ICAgICB9XG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIHN0YXJ0OiBmdW5jdGlvbiAoYWN0aW9uLCBpbnRlcmFjdGFibGUsIGVsZW1lbnQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmludGVyYWN0aW5nKClcbiAgICAgICAgICAgICAgICB8fCAhdGhpcy5wb2ludGVySXNEb3duXG4gICAgICAgICAgICAgICAgfHwgdGhpcy5wb2ludGVySWRzLmxlbmd0aCA8IChhY3Rpb24ubmFtZSA9PT0gJ2dlc3R1cmUnPyAyIDogMSkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGlmIHRoaXMgaW50ZXJhY3Rpb24gaGFkIGJlZW4gcmVtb3ZlZCBhZnRlciBzdG9wcGluZ1xuICAgICAgICAgICAgLy8gYWRkIGl0IGJhY2tcbiAgICAgICAgICAgIGlmIChpbmRleE9mKGludGVyYWN0aW9ucywgdGhpcykgPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Rpb25zLnB1c2godGhpcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSAgPSBhY3Rpb24ubmFtZTtcbiAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuYXhpcyAgPSBhY3Rpb24uYXhpcztcbiAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuZWRnZXMgPSBhY3Rpb24uZWRnZXM7XG4gICAgICAgICAgICB0aGlzLnRhcmdldCAgICAgICAgID0gaW50ZXJhY3RhYmxlO1xuICAgICAgICAgICAgdGhpcy5lbGVtZW50ICAgICAgICA9IGVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHRoaXMuc2V0U3RhcnRPZmZzZXRzKGFjdGlvbi5uYW1lLCBpbnRlcmFjdGFibGUsIGVsZW1lbnQpO1xuICAgICAgICAgICAgdGhpcy5zZXRNb2RpZmljYXRpb25zKHRoaXMuc3RhcnRDb29yZHMucGFnZSk7XG5cbiAgICAgICAgICAgIHRoaXMucHJldkV2ZW50ID0gdGhpc1t0aGlzLnByZXBhcmVkLm5hbWUgKyAnU3RhcnQnXSh0aGlzLmRvd25FdmVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlck1vdmU6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0LCBwcmVFbmQpIHtcbiAgICAgICAgICAgIHRoaXMucmVjb3JkUG9pbnRlcihwb2ludGVyKTtcblxuICAgICAgICAgICAgdGhpcy5zZXRFdmVudFhZKHRoaXMuY3VyQ29vcmRzLCAocG9pbnRlciBpbnN0YW5jZW9mIEludGVyYWN0RXZlbnQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IHRoaXMuaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHVuZGVmaW5lZCk7XG5cbiAgICAgICAgICAgIHZhciBkdXBsaWNhdGVNb3ZlID0gKHRoaXMuY3VyQ29vcmRzLnBhZ2UueCA9PT0gdGhpcy5wcmV2Q29vcmRzLnBhZ2UueFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgdGhpcy5jdXJDb29yZHMucGFnZS55ID09PSB0aGlzLnByZXZDb29yZHMucGFnZS55XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueCA9PT0gdGhpcy5wcmV2Q29vcmRzLmNsaWVudC54XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLmN1ckNvb3Jkcy5jbGllbnQueSA9PT0gdGhpcy5wcmV2Q29vcmRzLmNsaWVudC55KTtcblxuICAgICAgICAgICAgdmFyIGR4LCBkeSxcbiAgICAgICAgICAgICAgICBwb2ludGVySW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZChwb2ludGVyKSk7XG5cbiAgICAgICAgICAgIC8vIHJlZ2lzdGVyIG1vdmVtZW50IGdyZWF0ZXIgdGhhbiBwb2ludGVyTW92ZVRvbGVyYW5jZVxuICAgICAgICAgICAgaWYgKHRoaXMucG9pbnRlcklzRG93biAmJiAhdGhpcy5wb2ludGVyV2FzTW92ZWQpIHtcbiAgICAgICAgICAgICAgICBkeCA9IHRoaXMuY3VyQ29vcmRzLmNsaWVudC54IC0gdGhpcy5zdGFydENvb3Jkcy5jbGllbnQueDtcbiAgICAgICAgICAgICAgICBkeSA9IHRoaXMuY3VyQ29vcmRzLmNsaWVudC55IC0gdGhpcy5zdGFydENvb3Jkcy5jbGllbnQueTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcldhc01vdmVkID0gaHlwb3QoZHgsIGR5KSA+IHBvaW50ZXJNb3ZlVG9sZXJhbmNlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIWR1cGxpY2F0ZU1vdmUgJiYgKCF0aGlzLnBvaW50ZXJJc0Rvd24gfHwgdGhpcy5wb2ludGVyV2FzTW92ZWQpKSB7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucG9pbnRlcklzRG93bikge1xuICAgICAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQodGhpcy5ob2xkVGltZXJzW3BvaW50ZXJJbmRleF0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdtb3ZlJyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5wb2ludGVySXNEb3duKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBpZiAoZHVwbGljYXRlTW92ZSAmJiB0aGlzLnBvaW50ZXJXYXNNb3ZlZCAmJiAhcHJlRW5kKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0aGlzLnRhcmdldCwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHNldCBwb2ludGVyIGNvb3JkaW5hdGUsIHRpbWUgY2hhbmdlcyBhbmQgc3BlZWRzXG4gICAgICAgICAgICBzZXRFdmVudERlbHRhcyh0aGlzLnBvaW50ZXJEZWx0YSwgdGhpcy5wcmV2Q29vcmRzLCB0aGlzLmN1ckNvb3Jkcyk7XG5cbiAgICAgICAgICAgIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5wb2ludGVyV2FzTW92ZWRcbiAgICAgICAgICAgICAgICAvLyBpZ25vcmUgbW92ZW1lbnQgd2hpbGUgaW5lcnRpYSBpcyBhY3RpdmVcbiAgICAgICAgICAgICAgICAmJiAoIXRoaXMuaW5lcnRpYVN0YXR1cy5hY3RpdmUgfHwgKHBvaW50ZXIgaW5zdGFuY2VvZiBJbnRlcmFjdEV2ZW50ICYmIC9pbmVydGlhc3RhcnQvLnRlc3QocG9pbnRlci50eXBlKSkpKSB7XG5cbiAgICAgICAgICAgICAgICAvLyBpZiBqdXN0IHN0YXJ0aW5nIGFuIGFjdGlvbiwgY2FsY3VsYXRlIHRoZSBwb2ludGVyIHNwZWVkIG5vd1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5pbnRlcmFjdGluZygpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNldEV2ZW50RGVsdGFzKHRoaXMucG9pbnRlckRlbHRhLCB0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiBhIGRyYWcgaXMgaW4gdGhlIGNvcnJlY3QgYXhpc1xuICAgICAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmVwYXJlZC5uYW1lID09PSAnZHJhZycpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBhYnNYID0gTWF0aC5hYnMoZHgpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFic1kgPSBNYXRoLmFicyhkeSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0QXhpcyA9IHRoaXMudGFyZ2V0Lm9wdGlvbnMuZHJhZy5heGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF4aXMgPSAoYWJzWCA+IGFic1kgPyAneCcgOiBhYnNYIDwgYWJzWSA/ICd5JyA6ICd4eScpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgbW92ZW1lbnQgaXNuJ3QgaW4gdGhlIGF4aXMgb2YgdGhlIGludGVyYWN0YWJsZVxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGF4aXMgIT09ICd4eScgJiYgdGFyZ2V0QXhpcyAhPT0gJ3h5JyAmJiB0YXJnZXRBeGlzICE9PSBheGlzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gY2FuY2VsIHRoZSBwcmVwYXJlZCBhY3Rpb25cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgPSBudWxsO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gdGhlbiB0cnkgdG8gZ2V0IGEgZHJhZyBmcm9tIGFub3RoZXIgaW5lcmFjdGFibGVcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBlbGVtZW50IGludGVyYWN0YWJsZXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBlbGVtZW50SW50ZXJhY3RhYmxlID0gaW50ZXJhY3RhYmxlcy5nZXQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnRJbnRlcmFjdGFibGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGVsZW1lbnRJbnRlcmFjdGFibGUgIT09IHRoaXMudGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAhZWxlbWVudEludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGVsZW1lbnRJbnRlcmFjdGFibGUuZ2V0QWN0aW9uKHRoaXMuZG93blBvaW50ZXIsIHRoaXMsIGVsZW1lbnQpLm5hbWUgPT09ICdkcmFnJ1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgY2hlY2tBeGlzKGF4aXMsIGVsZW1lbnRJbnRlcmFjdGFibGUpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSA9ICdkcmFnJztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMudGFyZ2V0ID0gZWxlbWVudEludGVyYWN0YWJsZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGlmIHRoZXJlJ3Mgbm8gZHJhZyBmcm9tIGVsZW1lbnQgaW50ZXJhY3RhYmxlcyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayB0aGUgc2VsZWN0b3IgaW50ZXJhY3RhYmxlc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghdGhpcy5wcmVwYXJlZC5uYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBnZXREcmFnZ2FibGUgPSBmdW5jdGlvbiAoaW50ZXJhY3RhYmxlLCBzZWxlY3RvciwgY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGVsZW1lbnRzID0gaWU4TWF0Y2hlc1NlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBjb250ZXh0LnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGFibGUgPT09IHRoaXMudGFyZ2V0KSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5Db250ZXh0KGludGVyYWN0YWJsZSwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgIWludGVyYWN0YWJsZS5vcHRpb25zLmRyYWcubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAhdGVzdElnbm9yZShpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRlc3RBbGxvdyhpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvciwgZWxlbWVudHMpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgaW50ZXJhY3RhYmxlLmdldEFjdGlvbih0aGlzLmRvd25Qb2ludGVyLCB0aGlzLCBlbGVtZW50KS5uYW1lID09PSAnZHJhZydcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBjaGVja0F4aXMoYXhpcywgaW50ZXJhY3RhYmxlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHdpdGhpbkludGVyYWN0aW9uTGltaXQoaW50ZXJhY3RhYmxlLCBlbGVtZW50LCAnZHJhZycpKSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gaW50ZXJhY3RhYmxlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBldmVudFRhcmdldDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgc2VsZWN0b3JJbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvcihnZXREcmFnZ2FibGUpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoc2VsZWN0b3JJbnRlcmFjdGFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLm5hbWUgPSAnZHJhZyc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBzZWxlY3RvckludGVyYWN0YWJsZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVsZW1lbnQgPSBlbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50ID0gcGFyZW50RWxlbWVudChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBzdGFydGluZyA9ICEhdGhpcy5wcmVwYXJlZC5uYW1lICYmICF0aGlzLmludGVyYWN0aW5nKCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoc3RhcnRpbmdcbiAgICAgICAgICAgICAgICAgICAgJiYgKHRoaXMudGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5tYW51YWxTdGFydFxuICAgICAgICAgICAgICAgICAgICAgICAgfHwgIXdpdGhpbkludGVyYWN0aW9uTGltaXQodGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCwgdGhpcy5wcmVwYXJlZCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQubmFtZSAmJiB0aGlzLnRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoc3RhcnRpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuc3RhcnQodGhpcy5wcmVwYXJlZCwgdGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgc2hvdWxkTW92ZSA9IHRoaXMuc2V0TW9kaWZpY2F0aW9ucyh0aGlzLmN1ckNvb3Jkcy5wYWdlLCBwcmVFbmQpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIG1vdmUgaWYgc25hcHBpbmcgb3IgcmVzdHJpY3Rpb24gZG9lc24ndCBwcmV2ZW50IGl0XG4gICAgICAgICAgICAgICAgICAgIGlmIChzaG91bGRNb3ZlIHx8IHN0YXJ0aW5nKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXZFdmVudCA9IHRoaXNbdGhpcy5wcmVwYXJlZC5uYW1lICsgJ01vdmUnXShldmVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLmNoZWNrQW5kUHJldmVudERlZmF1bHQoZXZlbnQsIHRoaXMudGFyZ2V0LCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29weUNvb3Jkcyh0aGlzLnByZXZDb29yZHMsIHRoaXMuY3VyQ29vcmRzKTtcblxuICAgICAgICAgICAgaWYgKHRoaXMuZHJhZ2dpbmcgfHwgdGhpcy5yZXNpemluZykge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuZWRnZU1vdmUoZXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGRyYWdTdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgZHJhZ0V2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdkcmFnJywgJ3N0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5kcmFnZ2luZyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKGRyYWdFdmVudCk7XG5cbiAgICAgICAgICAgIC8vIHJlc2V0IGFjdGl2ZSBkcm9wem9uZXNcbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzID0gW107XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzICA9IFtdO1xuICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyAgICAgPSBbXTtcblxuICAgICAgICAgICAgaWYgKCF0aGlzLmR5bmFtaWNEcm9wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRBY3RpdmVEcm9wcyh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZHJvcEV2ZW50cyA9IHRoaXMuZ2V0RHJvcEV2ZW50cyhldmVudCwgZHJhZ0V2ZW50KTtcblxuICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMuYWN0aXZhdGUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpcmVBY3RpdmVEcm9wcyhkcm9wRXZlbnRzLmFjdGl2YXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGRyYWdFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICBkcmFnTW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgZHJhZ0V2ZW50ICA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAnZHJhZycsICdtb3ZlJywgdGhpcy5lbGVtZW50KSxcbiAgICAgICAgICAgICAgICBkcmFnZ2FibGVFbGVtZW50ID0gdGhpcy5lbGVtZW50LFxuICAgICAgICAgICAgICAgIGRyb3AgPSB0aGlzLmdldERyb3AoZHJhZ0V2ZW50LCBkcmFnZ2FibGVFbGVtZW50KTtcblxuICAgICAgICAgICAgdGhpcy5kcm9wVGFyZ2V0ID0gZHJvcC5kcm9wem9uZTtcbiAgICAgICAgICAgIHRoaXMuZHJvcEVsZW1lbnQgPSBkcm9wLmVsZW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciBkcm9wRXZlbnRzID0gdGhpcy5nZXREcm9wRXZlbnRzKGV2ZW50LCBkcmFnRXZlbnQpO1xuXG4gICAgICAgICAgICB0YXJnZXQuZmlyZShkcmFnRXZlbnQpO1xuXG4gICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5sZWF2ZSkgeyB0aGlzLnByZXZEcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5sZWF2ZSk7IH1cbiAgICAgICAgICAgIGlmIChkcm9wRXZlbnRzLmVudGVyKSB7ICAgICB0aGlzLmRyb3BUYXJnZXQuZmlyZShkcm9wRXZlbnRzLmVudGVyKTsgfVxuICAgICAgICAgICAgaWYgKGRyb3BFdmVudHMubW92ZSApIHsgICAgIHRoaXMuZHJvcFRhcmdldC5maXJlKGRyb3BFdmVudHMubW92ZSApOyB9XG5cbiAgICAgICAgICAgIHRoaXMucHJldkRyb3BUYXJnZXQgID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgdGhpcy5wcmV2RHJvcEVsZW1lbnQgPSB0aGlzLmRyb3BFbGVtZW50O1xuXG4gICAgICAgICAgICByZXR1cm4gZHJhZ0V2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlc2l6ZVN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciByZXNpemVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAncmVzaXplJywgJ3N0YXJ0JywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgaWYgKHRoaXMucHJlcGFyZWQuZWRnZXMpIHtcbiAgICAgICAgICAgICAgICB2YXIgc3RhcnRSZWN0ID0gdGhpcy50YXJnZXQuZ2V0UmVjdCh0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGFyZ2V0Lm9wdGlvbnMucmVzaXplLnNxdWFyZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgc3F1YXJlRWRnZXMgPSBleHRlbmQoe30sIHRoaXMucHJlcGFyZWQuZWRnZXMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHNxdWFyZUVkZ2VzLnRvcCAgICA9IHNxdWFyZUVkZ2VzLnRvcCAgICB8fCAoc3F1YXJlRWRnZXMubGVmdCAgICYmICFzcXVhcmVFZGdlcy5ib3R0b20pO1xuICAgICAgICAgICAgICAgICAgICBzcXVhcmVFZGdlcy5sZWZ0ICAgPSBzcXVhcmVFZGdlcy5sZWZ0ICAgfHwgKHNxdWFyZUVkZ2VzLnRvcCAgICAmJiAhc3F1YXJlRWRnZXMucmlnaHQgKTtcbiAgICAgICAgICAgICAgICAgICAgc3F1YXJlRWRnZXMuYm90dG9tID0gc3F1YXJlRWRnZXMuYm90dG9tIHx8IChzcXVhcmVFZGdlcy5yaWdodCAgJiYgIXNxdWFyZUVkZ2VzLnRvcCAgICk7XG4gICAgICAgICAgICAgICAgICAgIHNxdWFyZUVkZ2VzLnJpZ2h0ICA9IHNxdWFyZUVkZ2VzLnJpZ2h0ICB8fCAoc3F1YXJlRWRnZXMuYm90dG9tICYmICFzcXVhcmVFZGdlcy5sZWZ0ICApO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJlcGFyZWQuX3NxdWFyZUVkZ2VzID0gc3F1YXJlRWRnZXM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByZXBhcmVkLl9zcXVhcmVFZGdlcyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5yZXNpemVSZWN0cyA9IHtcbiAgICAgICAgICAgICAgICAgICAgc3RhcnQgICAgIDogc3RhcnRSZWN0LFxuICAgICAgICAgICAgICAgICAgICBjdXJyZW50ICAgOiBleHRlbmQoe30sIHN0YXJ0UmVjdCksXG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQ6IGV4dGVuZCh7fSwgc3RhcnRSZWN0KSxcbiAgICAgICAgICAgICAgICAgICAgcHJldmlvdXMgIDogZXh0ZW5kKHt9LCBzdGFydFJlY3QpLFxuICAgICAgICAgICAgICAgICAgICBkZWx0YSAgICAgOiB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsZWZ0OiAwLCByaWdodCA6IDAsIHdpZHRoIDogMCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRvcCA6IDAsIGJvdHRvbTogMCwgaGVpZ2h0OiAwXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgcmVzaXplRXZlbnQucmVjdCA9IHRoaXMucmVzaXplUmVjdHMucmVzdHJpY3RlZDtcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5kZWx0YVJlY3QgPSB0aGlzLnJlc2l6ZVJlY3RzLmRlbHRhO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKHJlc2l6ZUV2ZW50KTtcblxuICAgICAgICAgICAgdGhpcy5yZXNpemluZyA9IHRydWU7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNpemVFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICByZXNpemVNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciByZXNpemVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAncmVzaXplJywgJ21vdmUnLCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICB2YXIgZWRnZXMgPSB0aGlzLnByZXBhcmVkLmVkZ2VzLFxuICAgICAgICAgICAgICAgIGludmVydCA9IHRoaXMudGFyZ2V0Lm9wdGlvbnMucmVzaXplLmludmVydCxcbiAgICAgICAgICAgICAgICBpbnZlcnRpYmxlID0gaW52ZXJ0ID09PSAncmVwb3NpdGlvbicgfHwgaW52ZXJ0ID09PSAnbmVnYXRlJztcblxuICAgICAgICAgICAgaWYgKGVkZ2VzKSB7XG4gICAgICAgICAgICAgICAgdmFyIGR4ID0gcmVzaXplRXZlbnQuZHgsXG4gICAgICAgICAgICAgICAgICAgIGR5ID0gcmVzaXplRXZlbnQuZHksXG5cbiAgICAgICAgICAgICAgICAgICAgc3RhcnQgICAgICA9IHRoaXMucmVzaXplUmVjdHMuc3RhcnQsXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnQgICAgPSB0aGlzLnJlc2l6ZVJlY3RzLmN1cnJlbnQsXG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQgPSB0aGlzLnJlc2l6ZVJlY3RzLnJlc3RyaWN0ZWQsXG4gICAgICAgICAgICAgICAgICAgIGRlbHRhICAgICAgPSB0aGlzLnJlc2l6ZVJlY3RzLmRlbHRhLFxuICAgICAgICAgICAgICAgICAgICBwcmV2aW91cyAgID0gZXh0ZW5kKHRoaXMucmVzaXplUmVjdHMucHJldmlvdXMsIHJlc3RyaWN0ZWQpO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMudGFyZ2V0Lm9wdGlvbnMucmVzaXplLnNxdWFyZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgb3JpZ2luYWxFZGdlcyA9IGVkZ2VzO1xuXG4gICAgICAgICAgICAgICAgICAgIGVkZ2VzID0gdGhpcy5wcmVwYXJlZC5fc3F1YXJlRWRnZXM7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKChvcmlnaW5hbEVkZ2VzLmxlZnQgJiYgb3JpZ2luYWxFZGdlcy5ib3R0b20pXG4gICAgICAgICAgICAgICAgICAgICAgICB8fCAob3JpZ2luYWxFZGdlcy5yaWdodCAmJiBvcmlnaW5hbEVkZ2VzLnRvcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGR5ID0gLWR4O1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9yaWdpbmFsRWRnZXMubGVmdCB8fCBvcmlnaW5hbEVkZ2VzLnJpZ2h0KSB7IGR5ID0gZHg7IH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3JpZ2luYWxFZGdlcy50b3AgfHwgb3JpZ2luYWxFZGdlcy5ib3R0b20pIHsgZHggPSBkeTsgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZSB0aGUgJ2N1cnJlbnQnIHJlY3Qgd2l0aG91dCBtb2RpZmljYXRpb25zXG4gICAgICAgICAgICAgICAgaWYgKGVkZ2VzLnRvcCAgICkgeyBjdXJyZW50LnRvcCAgICArPSBkeTsgfVxuICAgICAgICAgICAgICAgIGlmIChlZGdlcy5ib3R0b20pIHsgY3VycmVudC5ib3R0b20gKz0gZHk7IH1cbiAgICAgICAgICAgICAgICBpZiAoZWRnZXMubGVmdCAgKSB7IGN1cnJlbnQubGVmdCAgICs9IGR4OyB9XG4gICAgICAgICAgICAgICAgaWYgKGVkZ2VzLnJpZ2h0ICkgeyBjdXJyZW50LnJpZ2h0ICArPSBkeDsgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGludmVydGlibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gaWYgaW52ZXJ0aWJsZSwgY29weSB0aGUgY3VycmVudCByZWN0XG4gICAgICAgICAgICAgICAgICAgIGV4dGVuZChyZXN0cmljdGVkLCBjdXJyZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaW52ZXJ0ID09PSAncmVwb3NpdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHN3YXAgZWRnZSB2YWx1ZXMgaWYgbmVjZXNzYXJ5IHRvIGtlZXAgd2lkdGgvaGVpZ2h0IHBvc2l0aXZlXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgc3dhcDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3RyaWN0ZWQudG9wID4gcmVzdHJpY3RlZC5ib3R0b20pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzd2FwID0gcmVzdHJpY3RlZC50b3A7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXN0cmljdGVkLnRvcCA9IHJlc3RyaWN0ZWQuYm90dG9tO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQuYm90dG9tID0gc3dhcDtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChyZXN0cmljdGVkLmxlZnQgPiByZXN0cmljdGVkLnJpZ2h0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dhcCA9IHJlc3RyaWN0ZWQubGVmdDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQubGVmdCA9IHJlc3RyaWN0ZWQucmlnaHQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVzdHJpY3RlZC5yaWdodCA9IHN3YXA7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmIG5vdCBpbnZlcnRpYmxlLCByZXN0cmljdCB0byBtaW5pbXVtIG9mIDB4MCByZWN0XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQudG9wICAgID0gTWF0aC5taW4oY3VycmVudC50b3AsIHN0YXJ0LmJvdHRvbSk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQuYm90dG9tID0gTWF0aC5tYXgoY3VycmVudC5ib3R0b20sIHN0YXJ0LnRvcCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQubGVmdCAgID0gTWF0aC5taW4oY3VycmVudC5sZWZ0LCBzdGFydC5yaWdodCk7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWQucmlnaHQgID0gTWF0aC5tYXgoY3VycmVudC5yaWdodCwgc3RhcnQubGVmdCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZC53aWR0aCAgPSByZXN0cmljdGVkLnJpZ2h0ICAtIHJlc3RyaWN0ZWQubGVmdDtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkLmhlaWdodCA9IHJlc3RyaWN0ZWQuYm90dG9tIC0gcmVzdHJpY3RlZC50b3AgO1xuXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgZWRnZSBpbiByZXN0cmljdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbHRhW2VkZ2VdID0gcmVzdHJpY3RlZFtlZGdlXSAtIHByZXZpb3VzW2VkZ2VdO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc2l6ZUV2ZW50LmVkZ2VzID0gdGhpcy5wcmVwYXJlZC5lZGdlcztcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5yZWN0ID0gcmVzdHJpY3RlZDtcbiAgICAgICAgICAgICAgICByZXNpemVFdmVudC5kZWx0YVJlY3QgPSBkZWx0YTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy50YXJnZXQuZmlyZShyZXNpemVFdmVudCk7XG5cbiAgICAgICAgICAgIHJldHVybiByZXNpemVFdmVudDtcbiAgICAgICAgfSxcblxuICAgICAgICBnZXN0dXJlU3RhcnQ6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdmFyIGdlc3R1cmVFdmVudCA9IG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCAnZ2VzdHVyZScsICdzdGFydCcsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGdlc3R1cmVFdmVudC5kcyA9IDA7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zdGFydERpc3RhbmNlID0gdGhpcy5nZXN0dXJlLnByZXZEaXN0YW5jZSA9IGdlc3R1cmVFdmVudC5kaXN0YW5jZTtcbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zdGFydEFuZ2xlID0gdGhpcy5nZXN0dXJlLnByZXZBbmdsZSA9IGdlc3R1cmVFdmVudC5hbmdsZTtcbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5zY2FsZSA9IDE7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyaW5nID0gdHJ1ZTtcblxuICAgICAgICAgICAgdGhpcy50YXJnZXQuZmlyZShnZXN0dXJlRXZlbnQpO1xuXG4gICAgICAgICAgICByZXR1cm4gZ2VzdHVyZUV2ZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIGdlc3R1cmVNb3ZlOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5wb2ludGVySWRzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLnByZXZFdmVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGdlc3R1cmVFdmVudDtcblxuICAgICAgICAgICAgZ2VzdHVyZUV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdnZXN0dXJlJywgJ21vdmUnLCB0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgZ2VzdHVyZUV2ZW50LmRzID0gZ2VzdHVyZUV2ZW50LnNjYWxlIC0gdGhpcy5nZXN0dXJlLnNjYWxlO1xuXG4gICAgICAgICAgICB0aGlzLnRhcmdldC5maXJlKGdlc3R1cmVFdmVudCk7XG5cbiAgICAgICAgICAgIHRoaXMuZ2VzdHVyZS5wcmV2QW5nbGUgPSBnZXN0dXJlRXZlbnQuYW5nbGU7XG4gICAgICAgICAgICB0aGlzLmdlc3R1cmUucHJldkRpc3RhbmNlID0gZ2VzdHVyZUV2ZW50LmRpc3RhbmNlO1xuXG4gICAgICAgICAgICBpZiAoZ2VzdHVyZUV2ZW50LnNjYWxlICE9PSBJbmZpbml0eSAmJlxuICAgICAgICAgICAgICAgIGdlc3R1cmVFdmVudC5zY2FsZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgICAgIGdlc3R1cmVFdmVudC5zY2FsZSAhPT0gdW5kZWZpbmVkICAmJlxuICAgICAgICAgICAgICAgICFpc05hTihnZXN0dXJlRXZlbnQuc2NhbGUpKSB7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmdlc3R1cmUuc2NhbGUgPSBnZXN0dXJlRXZlbnQuc2NhbGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBnZXN0dXJlRXZlbnQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlckhvbGQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsICdob2xkJyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcG9pbnRlclVwOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdKTtcblxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3VwJyApO1xuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3RhcCcpO1xuXG4gICAgICAgICAgICB0aGlzLnBvaW50ZXJFbmQocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgIHRoaXMucmVtb3ZlUG9pbnRlcihwb2ludGVyKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwb2ludGVyQ2FuY2VsOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHBvaW50ZXIpKTtcblxuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuaG9sZFRpbWVyc1twb2ludGVySW5kZXhdKTtcblxuICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ2NhbmNlbCcpO1xuICAgICAgICAgICAgdGhpcy5wb2ludGVyRW5kKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuXG4gICAgICAgICAgICB0aGlzLnJlbW92ZVBvaW50ZXIocG9pbnRlcik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gaHR0cDovL3d3dy5xdWlya3Ntb2RlLm9yZy9kb20vZXZlbnRzL2NsaWNrLmh0bWxcbiAgICAgICAgLy8gPkV2ZW50cyBsZWFkaW5nIHRvIGRibGNsaWNrXG4gICAgICAgIC8vXG4gICAgICAgIC8vIElFOCBkb2Vzbid0IGZpcmUgZG93biBldmVudCBiZWZvcmUgZGJsY2xpY2suXG4gICAgICAgIC8vIFRoaXMgd29ya2Fyb3VuZCB0cmllcyB0byBmaXJlIGEgdGFwIGFuZCBkb3VibGV0YXAgYWZ0ZXIgZGJsY2xpY2tcbiAgICAgICAgaWU4RGJsY2xpY2s6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnByZXZUYXBcbiAgICAgICAgICAgICAgICAmJiBldmVudC5jbGllbnRYID09PSB0aGlzLnByZXZUYXAuY2xpZW50WFxuICAgICAgICAgICAgICAgICYmIGV2ZW50LmNsaWVudFkgPT09IHRoaXMucHJldlRhcC5jbGllbnRZXG4gICAgICAgICAgICAgICAgJiYgZXZlbnRUYXJnZXQgICA9PT0gdGhpcy5wcmV2VGFwLnRhcmdldCkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5kb3duVGFyZ2V0c1swXSA9IGV2ZW50VGFyZ2V0O1xuICAgICAgICAgICAgICAgIHRoaXMuZG93blRpbWVzWzBdID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgdGhpcy5jb2xsZWN0RXZlbnRUYXJnZXRzKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgJ3RhcCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIEVuZCBpbnRlcmFjdCBtb3ZlIGV2ZW50cyBhbmQgc3RvcCBhdXRvLXNjcm9sbCB1bmxlc3MgaW5lcnRpYSBpcyBlbmFibGVkXG4gICAgICAgIHBvaW50ZXJFbmQ6IGZ1bmN0aW9uIChwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KSB7XG4gICAgICAgICAgICB2YXIgZW5kRXZlbnQsXG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGhpcy50YXJnZXQsXG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHRhcmdldCAmJiB0YXJnZXQub3B0aW9ucyxcbiAgICAgICAgICAgICAgICBpbmVydGlhT3B0aW9ucyA9IG9wdGlvbnMgJiYgdGhpcy5wcmVwYXJlZC5uYW1lICYmIG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5pbmVydGlhLFxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMgPSB0aGlzLmluZXJ0aWFTdGF0dXM7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmludGVyYWN0aW5nKCkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChpbmVydGlhU3RhdHVzLmFjdGl2ZSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgICAgIHZhciBwb2ludGVyU3BlZWQsXG4gICAgICAgICAgICAgICAgICAgIG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICAgICAgICAgICAgICBpbmVydGlhUG9zc2libGUgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYSA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBzbW9vdGhFbmQgPSBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZW5kU25hcCA9IGNoZWNrU25hcCh0YXJnZXQsIHRoaXMucHJlcGFyZWQubmFtZSkgJiYgb3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLnNuYXAuZW5kT25seSxcbiAgICAgICAgICAgICAgICAgICAgZW5kUmVzdHJpY3QgPSBjaGVja1Jlc3RyaWN0KHRhcmdldCwgdGhpcy5wcmVwYXJlZC5uYW1lKSAmJiBvcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QuZW5kT25seSxcbiAgICAgICAgICAgICAgICAgICAgZHggPSAwLFxuICAgICAgICAgICAgICAgICAgICBkeSA9IDAsXG4gICAgICAgICAgICAgICAgICAgIHN0YXJ0RXZlbnQ7XG5cbiAgICAgICAgICAgICAgICBpZiAodGhpcy5kcmFnZ2luZykge1xuICAgICAgICAgICAgICAgICAgICBpZiAgICAgIChvcHRpb25zLmRyYWcuYXhpcyA9PT0gJ3gnICkgeyBwb2ludGVyU3BlZWQgPSBNYXRoLmFicyh0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudngpOyB9XG4gICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKG9wdGlvbnMuZHJhZy5heGlzID09PSAneScgKSB7IHBvaW50ZXJTcGVlZCA9IE1hdGguYWJzKHRoaXMucG9pbnRlckRlbHRhLmNsaWVudC52eSk7IH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSAgIC8qb3B0aW9ucy5kcmFnLmF4aXMgPT09ICd4eScqL3sgcG9pbnRlclNwZWVkID0gdGhpcy5wb2ludGVyRGVsdGEuY2xpZW50LnNwZWVkOyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwb2ludGVyU3BlZWQgPSB0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQuc3BlZWQ7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gY2hlY2sgaWYgaW5lcnRpYSBzaG91bGQgYmUgc3RhcnRlZFxuICAgICAgICAgICAgICAgIGluZXJ0aWFQb3NzaWJsZSA9IChpbmVydGlhT3B0aW9ucyAmJiBpbmVydGlhT3B0aW9ucy5lbmFibGVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHJlcGFyZWQubmFtZSAhPT0gJ2dlc3R1cmUnXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIGV2ZW50ICE9PSBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYSA9IChpbmVydGlhUG9zc2libGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIChub3cgLSB0aGlzLmN1ckNvb3Jkcy50aW1lU3RhbXApIDwgNTBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHBvaW50ZXJTcGVlZCA+IGluZXJ0aWFPcHRpb25zLm1pblNwZWVkXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAmJiBwb2ludGVyU3BlZWQgPiBpbmVydGlhT3B0aW9ucy5lbmRTcGVlZCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5lcnRpYVBvc3NpYmxlICYmICFpbmVydGlhICYmIChlbmRTbmFwIHx8IGVuZFJlc3RyaWN0KSkge1xuXG4gICAgICAgICAgICAgICAgICAgIHZhciBzbmFwUmVzdHJpY3QgPSB7fTtcblxuICAgICAgICAgICAgICAgICAgICBzbmFwUmVzdHJpY3Quc25hcCA9IHNuYXBSZXN0cmljdC5yZXN0cmljdCA9IHNuYXBSZXN0cmljdDtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZW5kU25hcCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXRTbmFwcGluZyh0aGlzLmN1ckNvb3Jkcy5wYWdlLCBzbmFwUmVzdHJpY3QpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHNuYXBSZXN0cmljdC5sb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwUmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHkgKz0gc25hcFJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFJlc3RyaWN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnNldFJlc3RyaWN0aW9uKHRoaXMuY3VyQ29vcmRzLnBhZ2UsIHNuYXBSZXN0cmljdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc25hcFJlc3RyaWN0LnJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwUmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZHkgKz0gc25hcFJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGR4IHx8IGR5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzbW9vdGhFbmQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWEgfHwgc21vb3RoRW5kKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvcHlDb29yZHMoaW5lcnRpYVN0YXR1cy51cENvb3JkcywgdGhpcy5jdXJDb29yZHMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlcnNbMF0gPSBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQgPSBzdGFydEV2ZW50ID1cbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBJbnRlcmFjdEV2ZW50KHRoaXMsIGV2ZW50LCB0aGlzLnByZXBhcmVkLm5hbWUsICdpbmVydGlhc3RhcnQnLCB0aGlzLmVsZW1lbnQpO1xuXG4gICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMudDAgPSBub3c7XG5cbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0LmZpcmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaW5lcnRpYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy52eDAgPSB0aGlzLnBvaW50ZXJEZWx0YS5jbGllbnQudng7XG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnZ5MCA9IHRoaXMucG9pbnRlckRlbHRhLmNsaWVudC52eTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMudjAgPSBwb2ludGVyU3BlZWQ7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuY2FsY0luZXJ0aWEoaW5lcnRpYVN0YXR1cyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBwYWdlID0gZXh0ZW5kKHt9LCB0aGlzLmN1ckNvb3Jkcy5wYWdlKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcmlnaW4gPSBnZXRPcmlnaW5YWSh0YXJnZXQsIHRoaXMuZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RhdHVzT2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBwYWdlLnggPSBwYWdlLnggKyBpbmVydGlhU3RhdHVzLnhlIC0gb3JpZ2luLng7XG4gICAgICAgICAgICAgICAgICAgICAgICBwYWdlLnkgPSBwYWdlLnkgKyBpbmVydGlhU3RhdHVzLnllIC0gb3JpZ2luLnk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1c09iamVjdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VTdGF0dXNYWTogdHJ1ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB4OiBwYWdlLngsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeTogcGFnZS55LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR4OiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5OiAwLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNuYXA6IG51bGxcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHN0YXR1c09iamVjdC5zbmFwID0gc3RhdHVzT2JqZWN0O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBkeCA9IGR5ID0gMDtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFNuYXApIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB2YXIgc25hcCA9IHRoaXMuc2V0U25hcHBpbmcodGhpcy5jdXJDb29yZHMucGFnZSwgc3RhdHVzT2JqZWN0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzbmFwLmxvY2tlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeCArPSBzbmFwLmR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkeSArPSBzbmFwLmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVuZFJlc3RyaWN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIHJlc3RyaWN0ID0gdGhpcy5zZXRSZXN0cmljdGlvbih0aGlzLmN1ckNvb3Jkcy5wYWdlLCBzdGF0dXNPYmplY3QpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3RyaWN0LnJlc3RyaWN0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZHggKz0gcmVzdHJpY3QuZHg7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGR5ICs9IHJlc3RyaWN0LmR5O1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5tb2RpZmllZFhlICs9IGR4O1xuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5tb2RpZmllZFllICs9IGR5O1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kSW5lcnRpYUZyYW1lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc21vb3RoRW5kID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMueGUgPSBkeDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMueWUgPSBkeTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMuc3kgPSAwO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kU21vb3RoRW5kRnJhbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGVuZFNuYXAgfHwgZW5kUmVzdHJpY3QpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZmlyZSBhIG1vdmUgZXZlbnQgYXQgdGhlIHNuYXBwZWQgY29vcmRpbmF0ZXNcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0LCB0cnVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRyYWdnaW5nKSB7XG4gICAgICAgICAgICAgICAgZW5kRXZlbnQgPSBuZXcgSW50ZXJhY3RFdmVudCh0aGlzLCBldmVudCwgJ2RyYWcnLCAnZW5kJywgdGhpcy5lbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHZhciBkcmFnZ2FibGVFbGVtZW50ID0gdGhpcy5lbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICBkcm9wID0gdGhpcy5nZXREcm9wKGVuZEV2ZW50LCBkcmFnZ2FibGVFbGVtZW50KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuZHJvcFRhcmdldCA9IGRyb3AuZHJvcHpvbmU7XG4gICAgICAgICAgICAgICAgdGhpcy5kcm9wRWxlbWVudCA9IGRyb3AuZWxlbWVudDtcblxuICAgICAgICAgICAgICAgIHZhciBkcm9wRXZlbnRzID0gdGhpcy5nZXREcm9wRXZlbnRzKGV2ZW50LCBlbmRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5sZWF2ZSkgeyB0aGlzLnByZXZEcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5sZWF2ZSk7IH1cbiAgICAgICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5lbnRlcikgeyAgICAgdGhpcy5kcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5lbnRlcik7IH1cbiAgICAgICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5kcm9wICkgeyAgICAgdGhpcy5kcm9wVGFyZ2V0LmZpcmUoZHJvcEV2ZW50cy5kcm9wICk7IH1cbiAgICAgICAgICAgICAgICBpZiAoZHJvcEV2ZW50cy5kZWFjdGl2YXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZmlyZUFjdGl2ZURyb3BzKGRyb3BFdmVudHMuZGVhY3RpdmF0ZSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGFyZ2V0LmZpcmUoZW5kRXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5yZXNpemluZykge1xuICAgICAgICAgICAgICAgIGVuZEV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdyZXNpemUnLCAnZW5kJywgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB0YXJnZXQuZmlyZShlbmRFdmVudCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLmdlc3R1cmluZykge1xuICAgICAgICAgICAgICAgIGVuZEV2ZW50ID0gbmV3IEludGVyYWN0RXZlbnQodGhpcywgZXZlbnQsICdnZXN0dXJlJywgJ2VuZCcsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgdGFyZ2V0LmZpcmUoZW5kRXZlbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnN0b3AoZXZlbnQpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNvbGxlY3REcm9wczogZnVuY3Rpb24gKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHZhciBkcm9wcyA9IFtdLFxuICAgICAgICAgICAgICAgIGVsZW1lbnRzID0gW10sXG4gICAgICAgICAgICAgICAgaTtcblxuICAgICAgICAgICAgZWxlbWVudCA9IGVsZW1lbnQgfHwgdGhpcy5lbGVtZW50O1xuXG4gICAgICAgICAgICAvLyBjb2xsZWN0IGFsbCBkcm9wem9uZXMgYW5kIHRoZWlyIGVsZW1lbnRzIHdoaWNoIHF1YWxpZnkgZm9yIGEgZHJvcFxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGludGVyYWN0YWJsZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoIWludGVyYWN0YWJsZXNbaV0ub3B0aW9ucy5kcm9wLmVuYWJsZWQpIHsgY29udGludWU7IH1cblxuICAgICAgICAgICAgICAgIHZhciBjdXJyZW50ID0gaW50ZXJhY3RhYmxlc1tpXSxcbiAgICAgICAgICAgICAgICAgICAgYWNjZXB0ID0gY3VycmVudC5vcHRpb25zLmRyb3AuYWNjZXB0O1xuXG4gICAgICAgICAgICAgICAgLy8gdGVzdCB0aGUgZHJhZ2dhYmxlIGVsZW1lbnQgYWdhaW5zdCB0aGUgZHJvcHpvbmUncyBhY2NlcHQgc2V0dGluZ1xuICAgICAgICAgICAgICAgIGlmICgoaXNFbGVtZW50KGFjY2VwdCkgJiYgYWNjZXB0ICE9PSBlbGVtZW50KVxuICAgICAgICAgICAgICAgICAgICB8fCAoaXNTdHJpbmcoYWNjZXB0KVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgIW1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBhY2NlcHQpKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIHF1ZXJ5IGZvciBuZXcgZWxlbWVudHMgaWYgbmVjZXNzYXJ5XG4gICAgICAgICAgICAgICAgdmFyIGRyb3BFbGVtZW50cyA9IGN1cnJlbnQuc2VsZWN0b3I/IGN1cnJlbnQuX2NvbnRleHQucXVlcnlTZWxlY3RvckFsbChjdXJyZW50LnNlbGVjdG9yKSA6IFtjdXJyZW50Ll9lbGVtZW50XTtcblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwLCBsZW4gPSBkcm9wRWxlbWVudHMubGVuZ3RoOyBqIDwgbGVuOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRFbGVtZW50ID0gZHJvcEVsZW1lbnRzW2pdO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50RWxlbWVudCA9PT0gZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBkcm9wcy5wdXNoKGN1cnJlbnQpO1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50cy5wdXNoKGN1cnJlbnRFbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgZHJvcHpvbmVzOiBkcm9wcyxcbiAgICAgICAgICAgICAgICBlbGVtZW50czogZWxlbWVudHNcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG5cbiAgICAgICAgZmlyZUFjdGl2ZURyb3BzOiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIHZhciBpLFxuICAgICAgICAgICAgICAgIGN1cnJlbnQsXG4gICAgICAgICAgICAgICAgY3VycmVudEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgcHJldkVsZW1lbnQ7XG5cbiAgICAgICAgICAgIC8vIGxvb3AgdGhyb3VnaCBhbGwgYWN0aXZlIGRyb3B6b25lcyBhbmQgdHJpZ2dlciBldmVudFxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzW2ldO1xuICAgICAgICAgICAgICAgIGN1cnJlbnRFbGVtZW50ID0gdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyBbaV07XG5cbiAgICAgICAgICAgICAgICAvLyBwcmV2ZW50IHRyaWdnZXIgb2YgZHVwbGljYXRlIGV2ZW50cyBvbiBzYW1lIGVsZW1lbnRcbiAgICAgICAgICAgICAgICBpZiAoY3VycmVudEVsZW1lbnQgIT09IHByZXZFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHNldCBjdXJyZW50IGVsZW1lbnQgYXMgZXZlbnQgdGFyZ2V0XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50LnRhcmdldCA9IGN1cnJlbnRFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50LmZpcmUoZXZlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBwcmV2RWxlbWVudCA9IGN1cnJlbnRFbGVtZW50O1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIENvbGxlY3QgYSBuZXcgc2V0IG9mIHBvc3NpYmxlIGRyb3BzIGFuZCBzYXZlIHRoZW0gaW4gYWN0aXZlRHJvcHMuXG4gICAgICAgIC8vIHNldEFjdGl2ZURyb3BzIHNob3VsZCBhbHdheXMgYmUgY2FsbGVkIHdoZW4gYSBkcmFnIGhhcyBqdXN0IHN0YXJ0ZWQgb3IgYVxuICAgICAgICAvLyBkcmFnIGV2ZW50IGhhcHBlbnMgd2hpbGUgZHluYW1pY0Ryb3AgaXMgdHJ1ZVxuICAgICAgICBzZXRBY3RpdmVEcm9wczogZnVuY3Rpb24gKGRyYWdFbGVtZW50KSB7XG4gICAgICAgICAgICAvLyBnZXQgZHJvcHpvbmVzIGFuZCB0aGVpciBlbGVtZW50cyB0aGF0IGNvdWxkIHJlY2VpdmUgdGhlIGRyYWdnYWJsZVxuICAgICAgICAgICAgdmFyIHBvc3NpYmxlRHJvcHMgPSB0aGlzLmNvbGxlY3REcm9wcyhkcmFnRWxlbWVudCwgdHJ1ZSk7XG5cbiAgICAgICAgICAgIHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzID0gcG9zc2libGVEcm9wcy5kcm9wem9uZXM7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzICA9IHBvc3NpYmxlRHJvcHMuZWxlbWVudHM7XG4gICAgICAgICAgICB0aGlzLmFjdGl2ZURyb3BzLnJlY3RzICAgICA9IFtdO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5yZWN0c1tpXSA9IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzW2ldLmdldFJlY3QodGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50c1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0RHJvcDogZnVuY3Rpb24gKGV2ZW50LCBkcmFnRWxlbWVudCkge1xuICAgICAgICAgICAgdmFyIHZhbGlkRHJvcHMgPSBbXTtcblxuICAgICAgICAgICAgaWYgKGR5bmFtaWNEcm9wKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRBY3RpdmVEcm9wcyhkcmFnRWxlbWVudCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNvbGxlY3QgYWxsIGRyb3B6b25lcyBhbmQgdGhlaXIgZWxlbWVudHMgd2hpY2ggcXVhbGlmeSBmb3IgYSBkcm9wXG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuYWN0aXZlRHJvcHMuZHJvcHpvbmVzLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgICAgICAgID0gdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXNbal0sXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRFbGVtZW50ID0gdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyBbal0sXG4gICAgICAgICAgICAgICAgICAgIHJlY3QgICAgICAgICAgID0gdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyAgICBbal07XG5cbiAgICAgICAgICAgICAgICB2YWxpZERyb3BzLnB1c2goY3VycmVudC5kcm9wQ2hlY2sodGhpcy5wb2ludGVyc1swXSwgdGhpcy50YXJnZXQsIGRyYWdFbGVtZW50LCBjdXJyZW50RWxlbWVudCwgcmVjdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgPyBjdXJyZW50RWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IG51bGwpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBnZXQgdGhlIG1vc3QgYXBwcm9wcmlhdGUgZHJvcHpvbmUgYmFzZWQgb24gRE9NIGRlcHRoIGFuZCBvcmRlclxuICAgICAgICAgICAgdmFyIGRyb3BJbmRleCA9IGluZGV4T2ZEZWVwZXN0RWxlbWVudCh2YWxpZERyb3BzKSxcbiAgICAgICAgICAgICAgICBkcm9wem9uZSAgPSB0aGlzLmFjdGl2ZURyb3BzLmRyb3B6b25lc1tkcm9wSW5kZXhdIHx8IG51bGwsXG4gICAgICAgICAgICAgICAgZWxlbWVudCAgID0gdGhpcy5hY3RpdmVEcm9wcy5lbGVtZW50cyBbZHJvcEluZGV4XSB8fCBudWxsO1xuXG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIGRyb3B6b25lOiBkcm9wem9uZSxcbiAgICAgICAgICAgICAgICBlbGVtZW50OiBlbGVtZW50XG4gICAgICAgICAgICB9O1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldERyb3BFdmVudHM6IGZ1bmN0aW9uIChwb2ludGVyRXZlbnQsIGRyYWdFdmVudCkge1xuICAgICAgICAgICAgdmFyIGRyb3BFdmVudHMgPSB7XG4gICAgICAgICAgICAgICAgZW50ZXIgICAgIDogbnVsbCxcbiAgICAgICAgICAgICAgICBsZWF2ZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGFjdGl2YXRlICA6IG51bGwsXG4gICAgICAgICAgICAgICAgZGVhY3RpdmF0ZTogbnVsbCxcbiAgICAgICAgICAgICAgICBtb3ZlICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgIGRyb3AgICAgICA6IG51bGxcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmICh0aGlzLmRyb3BFbGVtZW50ICE9PSB0aGlzLnByZXZEcm9wRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIC8vIGlmIHRoZXJlIHdhcyBhIHByZXZEcm9wVGFyZ2V0LCBjcmVhdGUgYSBkcmFnbGVhdmUgZXZlbnRcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5wcmV2RHJvcFRhcmdldCkge1xuICAgICAgICAgICAgICAgICAgICBkcm9wRXZlbnRzLmxlYXZlID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogdGhpcy5wcmV2RHJvcEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLnByZXZEcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgcmVsYXRlZFRhcmdldDogZHJhZ0V2ZW50LnRhcmdldCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZSAgICA6IGRyYWdFdmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiAgOiB0aGlzLFxuICAgICAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcmFnbGVhdmUnXG4gICAgICAgICAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyYWdMZWF2ZSA9IHRoaXMucHJldkRyb3BFbGVtZW50O1xuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQucHJldkRyb3B6b25lID0gdGhpcy5wcmV2RHJvcFRhcmdldDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhlIGRyb3BUYXJnZXQgaXMgbm90IG51bGwsIGNyZWF0ZSBhIGRyYWdlbnRlciBldmVudFxuICAgICAgICAgICAgICAgIGlmICh0aGlzLmRyb3BUYXJnZXQpIHtcbiAgICAgICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5lbnRlciA9IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldCAgICAgICA6IHRoaXMuZHJvcEVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLmRyb3BUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgZHJhZ2dhYmxlICAgIDogZHJhZ0V2ZW50LmludGVyYWN0YWJsZSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudCAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aW1lU3RhbXAgICAgOiBkcmFnRXZlbnQudGltZVN0YW1wLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2RyYWdlbnRlcidcbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQuZHJhZ0VudGVyID0gdGhpcy5kcm9wRWxlbWVudDtcbiAgICAgICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyb3B6b25lID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGRyYWdFdmVudC50eXBlID09PSAnZHJhZ2VuZCcgJiYgdGhpcy5kcm9wVGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5kcm9wID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiB0aGlzLmRyb3BFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiB0aGlzLmRyb3BUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0ZWRUYXJnZXQ6IGRyYWdFdmVudC50YXJnZXQsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdnYWJsZSAgICA6IGRyYWdFdmVudC5pbnRlcmFjdGFibGUsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdFdmVudCAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24gIDogdGhpcyxcbiAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2Ryb3AnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdzdGFydCcpIHtcbiAgICAgICAgICAgICAgICBkcm9wRXZlbnRzLmFjdGl2YXRlID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wYWN0aXZhdGUnXG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChkcmFnRXZlbnQudHlwZSA9PT0gJ2RyYWdlbmQnKSB7XG4gICAgICAgICAgICAgICAgZHJvcEV2ZW50cy5kZWFjdGl2YXRlID0ge1xuICAgICAgICAgICAgICAgICAgICB0YXJnZXQgICAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBkcm9wem9uZSAgICAgOiBudWxsLFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIHRpbWVTdGFtcCAgICA6IGRyYWdFdmVudC50aW1lU3RhbXAsXG4gICAgICAgICAgICAgICAgICAgIHR5cGUgICAgICAgICA6ICdkcm9wZGVhY3RpdmF0ZSdcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGRyYWdFdmVudC50eXBlID09PSAnZHJhZ21vdmUnICYmIHRoaXMuZHJvcFRhcmdldCkge1xuICAgICAgICAgICAgICAgIGRyb3BFdmVudHMubW92ZSA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0ICAgICAgIDogdGhpcy5kcm9wRWxlbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZHJvcHpvbmUgICAgIDogdGhpcy5kcm9wVGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICByZWxhdGVkVGFyZ2V0OiBkcmFnRXZlbnQudGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICBkcmFnZ2FibGUgICAgOiBkcmFnRXZlbnQuaW50ZXJhY3RhYmxlLFxuICAgICAgICAgICAgICAgICAgICBkcmFnRXZlbnQgICAgOiBkcmFnRXZlbnQsXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uICA6IHRoaXMsXG4gICAgICAgICAgICAgICAgICAgIGRyYWdtb3ZlICAgICA6IGRyYWdFdmVudCxcbiAgICAgICAgICAgICAgICAgICAgdGltZVN0YW1wICAgIDogZHJhZ0V2ZW50LnRpbWVTdGFtcCxcbiAgICAgICAgICAgICAgICAgICAgdHlwZSAgICAgICAgIDogJ2Ryb3Btb3ZlJ1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZHJhZ0V2ZW50LmRyb3B6b25lID0gdGhpcy5kcm9wVGFyZ2V0O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZHJvcEV2ZW50cztcbiAgICAgICAgfSxcblxuICAgICAgICBjdXJyZW50QWN0aW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKHRoaXMuZHJhZ2dpbmcgJiYgJ2RyYWcnKSB8fCAodGhpcy5yZXNpemluZyAmJiAncmVzaXplJykgfHwgKHRoaXMuZ2VzdHVyaW5nICYmICdnZXN0dXJlJykgfHwgbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICBpbnRlcmFjdGluZzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZHJhZ2dpbmcgfHwgdGhpcy5yZXNpemluZyB8fCB0aGlzLmdlc3R1cmluZztcbiAgICAgICAgfSxcblxuICAgICAgICBjbGVhclRhcmdldHM6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnRhcmdldCAmJiAhdGhpcy50YXJnZXQuc2VsZWN0b3IpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnRhcmdldCA9IHRoaXMuZWxlbWVudCA9IG51bGw7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZHJvcFRhcmdldCA9IHRoaXMuZHJvcEVsZW1lbnQgPSB0aGlzLnByZXZEcm9wVGFyZ2V0ID0gdGhpcy5wcmV2RHJvcEVsZW1lbnQgPSBudWxsO1xuICAgICAgICB9LFxuXG4gICAgICAgIHN0b3A6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgIGF1dG9TY3JvbGwuc3RvcCgpO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hlcyA9IFtdO1xuICAgICAgICAgICAgICAgIHRoaXMubWF0Y2hFbGVtZW50cyA9IFtdO1xuXG4gICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0O1xuXG4gICAgICAgICAgICAgICAgaWYgKHRhcmdldC5vcHRpb25zLnN0eWxlQ3Vyc29yKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldC5fZG9jLmRvY3VtZW50RWxlbWVudC5zdHlsZS5jdXJzb3IgPSAnJztcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBwcmV2ZW50IERlZmF1bHQgb25seSBpZiB3ZXJlIHByZXZpb3VzbHkgaW50ZXJhY3RpbmdcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnQgJiYgaXNGdW5jdGlvbihldmVudC5wcmV2ZW50RGVmYXVsdCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50LCB0YXJnZXQsIHRoaXMuZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuZHJhZ2dpbmcpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5hY3RpdmVEcm9wcy5kcm9wem9uZXMgPSB0aGlzLmFjdGl2ZURyb3BzLmVsZW1lbnRzID0gdGhpcy5hY3RpdmVEcm9wcy5yZWN0cyA9IG51bGw7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5jbGVhclRhcmdldHMoKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wb2ludGVySXNEb3duID0gdGhpcy5zbmFwU3RhdHVzLmxvY2tlZCA9IHRoaXMuZHJhZ2dpbmcgPSB0aGlzLnJlc2l6aW5nID0gdGhpcy5nZXN0dXJpbmcgPSBmYWxzZTtcbiAgICAgICAgICAgIHRoaXMucHJlcGFyZWQubmFtZSA9IHRoaXMucHJldkV2ZW50ID0gbnVsbDtcbiAgICAgICAgICAgIHRoaXMuaW5lcnRpYVN0YXR1cy5yZXN1bWVEeCA9IHRoaXMuaW5lcnRpYVN0YXR1cy5yZXN1bWVEeSA9IDA7XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBwb2ludGVycyBpZiB0aGVpciBJRCBpc24ndCBpbiB0aGlzLnBvaW50ZXJJZHNcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5wb2ludGVycy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIGlmIChpbmRleE9mKHRoaXMucG9pbnRlcklkcywgZ2V0UG9pbnRlcklkKHRoaXMucG9pbnRlcnNbaV0pKSA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wb2ludGVycy5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBkZWxldGUgaW50ZXJhY3Rpb24gaWYgaXQncyBub3QgdGhlIG9ubHkgb25lXG4gICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb25zLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbnMuc3BsaWNlKGluZGV4T2YoaW50ZXJhY3Rpb25zLCB0aGlzKSwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW5lcnRpYUZyYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgaW5lcnRpYVN0YXR1cyA9IHRoaXMuaW5lcnRpYVN0YXR1cyxcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gdGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLmluZXJ0aWEsXG4gICAgICAgICAgICAgICAgbGFtYmRhID0gb3B0aW9ucy5yZXNpc3RhbmNlLFxuICAgICAgICAgICAgICAgIHQgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSAvIDEwMDAgLSBpbmVydGlhU3RhdHVzLnQwO1xuXG4gICAgICAgICAgICBpZiAodCA8IGluZXJ0aWFTdGF0dXMudGUpIHtcblxuICAgICAgICAgICAgICAgIHZhciBwcm9ncmVzcyA9ICAxIC0gKE1hdGguZXhwKC1sYW1iZGEgKiB0KSAtIGluZXJ0aWFTdGF0dXMubGFtYmRhX3YwKSAvIGluZXJ0aWFTdGF0dXMub25lX3ZlX3YwO1xuXG4gICAgICAgICAgICAgICAgaWYgKGluZXJ0aWFTdGF0dXMubW9kaWZpZWRYZSA9PT0gaW5lcnRpYVN0YXR1cy54ZSAmJiBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWWUgPT09IGluZXJ0aWFTdGF0dXMueWUpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IGluZXJ0aWFTdGF0dXMueGUgKiBwcm9ncmVzcztcbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGluZXJ0aWFTdGF0dXMueWUgKiBwcm9ncmVzcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBxdWFkUG9pbnQgPSBnZXRRdWFkcmF0aWNDdXJ2ZVBvaW50KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDAsIDAsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy54ZSwgaW5lcnRpYVN0YXR1cy55ZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWGUsIGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9ncmVzcyk7XG5cbiAgICAgICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeCA9IHF1YWRQb2ludC54O1xuICAgICAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gcXVhZFBvaW50Lnk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyTW92ZShpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQsIGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCk7XG5cbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLmkgPSByZXFGcmFtZSh0aGlzLmJvdW5kSW5lcnRpYUZyYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3ggPSBpbmVydGlhU3RhdHVzLm1vZGlmaWVkWGU7XG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5zeSA9IGluZXJ0aWFTdGF0dXMubW9kaWZpZWRZZTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlck1vdmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJFbmQoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNtb290aEVuZEZyYW1lOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgaW5lcnRpYVN0YXR1cyA9IHRoaXMuaW5lcnRpYVN0YXR1cyxcbiAgICAgICAgICAgICAgICB0ID0gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBpbmVydGlhU3RhdHVzLnQwLFxuICAgICAgICAgICAgICAgIGR1cmF0aW9uID0gdGhpcy50YXJnZXQub3B0aW9uc1t0aGlzLnByZXBhcmVkLm5hbWVdLmluZXJ0aWEuc21vb3RoRW5kRHVyYXRpb247XG5cbiAgICAgICAgICAgIGlmICh0IDwgZHVyYXRpb24pIHtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN4ID0gZWFzZU91dFF1YWQodCwgMCwgaW5lcnRpYVN0YXR1cy54ZSwgZHVyYXRpb24pO1xuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuc3kgPSBlYXNlT3V0UXVhZCh0LCAwLCBpbmVydGlhU3RhdHVzLnllLCBkdXJhdGlvbik7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJNb3ZlKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGluZXJ0aWFTdGF0dXMuaSA9IHJlcUZyYW1lKHRoaXMuYm91bmRTbW9vdGhFbmRGcmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN4ID0gaW5lcnRpYVN0YXR1cy54ZTtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnN5ID0gaW5lcnRpYVN0YXR1cy55ZTtcblxuICAgICAgICAgICAgICAgIHRoaXMucG9pbnRlck1vdmUoaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50LCBpbmVydGlhU3RhdHVzLnN0YXJ0RXZlbnQpO1xuXG4gICAgICAgICAgICAgICAgaW5lcnRpYVN0YXR1cy5hY3RpdmUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICBpbmVydGlhU3RhdHVzLnNtb290aEVuZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wb2ludGVyRW5kKGluZXJ0aWFTdGF0dXMuc3RhcnRFdmVudCwgaW5lcnRpYVN0YXR1cy5zdGFydEV2ZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBhZGRQb2ludGVyOiBmdW5jdGlvbiAocG9pbnRlcikge1xuICAgICAgICAgICAgdmFyIGlkID0gZ2V0UG9pbnRlcklkKHBvaW50ZXIpLFxuICAgICAgICAgICAgICAgIGluZGV4ID0gdGhpcy5tb3VzZT8gMCA6IGluZGV4T2YodGhpcy5wb2ludGVySWRzLCBpZCk7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHtcbiAgICAgICAgICAgICAgICBpbmRleCA9IHRoaXMucG9pbnRlcklkcy5sZW5ndGg7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklkc1tpbmRleF0gPSBpZDtcbiAgICAgICAgICAgIHRoaXMucG9pbnRlcnNbaW5kZXhdID0gcG9pbnRlcjtcblxuICAgICAgICAgICAgcmV0dXJuIGluZGV4O1xuICAgICAgICB9LFxuXG4gICAgICAgIHJlbW92ZVBvaW50ZXI6IGZ1bmN0aW9uIChwb2ludGVyKSB7XG4gICAgICAgICAgICB2YXIgaWQgPSBnZXRQb2ludGVySWQocG9pbnRlciksXG4gICAgICAgICAgICAgICAgaW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGlkKTtcblxuICAgICAgICAgICAgaWYgKGluZGV4ID09PSAtMSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgaWYgKCF0aGlzLmludGVyYWN0aW5nKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnBvaW50ZXJzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcklkcyAuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIHRoaXMuZG93blRhcmdldHMuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIHRoaXMuZG93blRpbWVzICAuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgICAgIHRoaXMuaG9sZFRpbWVycyAuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWNvcmRQb2ludGVyOiBmdW5jdGlvbiAocG9pbnRlcikge1xuICAgICAgICAgICAgLy8gRG8gbm90IHVwZGF0ZSBwb2ludGVycyB3aGlsZSBpbmVydGlhIGlzIGFjdGl2ZS5cbiAgICAgICAgICAgIC8vIFRoZSBpbmVydGlhIHN0YXJ0IGV2ZW50IHNob3VsZCBiZSB0aGlzLnBvaW50ZXJzWzBdXG4gICAgICAgICAgICBpZiAodGhpcy5pbmVydGlhU3RhdHVzLmFjdGl2ZSkgeyByZXR1cm47IH1cblxuICAgICAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5tb3VzZT8gMDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZChwb2ludGVyKSk7XG5cbiAgICAgICAgICAgIGlmIChpbmRleCA9PT0gLTEpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgIHRoaXMucG9pbnRlcnNbaW5kZXhdID0gcG9pbnRlcjtcbiAgICAgICAgfSxcblxuICAgICAgICBjb2xsZWN0RXZlbnRUYXJnZXRzOiBmdW5jdGlvbiAocG9pbnRlciwgZXZlbnQsIGV2ZW50VGFyZ2V0LCBldmVudFR5cGUpIHtcbiAgICAgICAgICAgIHZhciBwb2ludGVySW5kZXggPSB0aGlzLm1vdXNlPyAwIDogaW5kZXhPZih0aGlzLnBvaW50ZXJJZHMsIGdldFBvaW50ZXJJZChwb2ludGVyKSk7XG5cbiAgICAgICAgICAgIC8vIGRvIG5vdCBmaXJlIGEgdGFwIGV2ZW50IGlmIHRoZSBwb2ludGVyIHdhcyBtb3ZlZCBiZWZvcmUgYmVpbmcgbGlmdGVkXG4gICAgICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAndGFwJyAmJiAodGhpcy5wb2ludGVyV2FzTW92ZWRcbiAgICAgICAgICAgICAgICAvLyBvciBpZiB0aGUgcG9pbnRlcnVwIHRhcmdldCBpcyBkaWZmZXJlbnQgdG8gdGhlIHBvaW50ZXJkb3duIHRhcmdldFxuICAgICAgICAgICAgICAgIHx8ICEodGhpcy5kb3duVGFyZ2V0c1twb2ludGVySW5kZXhdICYmIHRoaXMuZG93blRhcmdldHNbcG9pbnRlckluZGV4XSA9PT0gZXZlbnRUYXJnZXQpKSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHRhcmdldHMgPSBbXSxcbiAgICAgICAgICAgICAgICBlbGVtZW50cyA9IFtdLFxuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBldmVudFRhcmdldDtcblxuICAgICAgICAgICAgZnVuY3Rpb24gY29sbGVjdFNlbGVjdG9ycyAoaW50ZXJhY3RhYmxlLCBzZWxlY3RvciwgY29udGV4dCkge1xuICAgICAgICAgICAgICAgIHZhciBlbHMgPSBpZThNYXRjaGVzU2VsZWN0b3JcbiAgICAgICAgICAgICAgICAgICAgICAgID8gY29udGV4dC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKVxuICAgICAgICAgICAgICAgICAgICAgICAgOiB1bmRlZmluZWQ7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3RhYmxlLl9pRXZlbnRzW2V2ZW50VHlwZV1cbiAgICAgICAgICAgICAgICAgICAgJiYgaXNFbGVtZW50KGVsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgICYmIGluQ29udGV4dChpbnRlcmFjdGFibGUsIGVsZW1lbnQpXG4gICAgICAgICAgICAgICAgICAgICYmICF0ZXN0SWdub3JlKGludGVyYWN0YWJsZSwgZWxlbWVudCwgZXZlbnRUYXJnZXQpXG4gICAgICAgICAgICAgICAgICAgICYmIHRlc3RBbGxvdyhpbnRlcmFjdGFibGUsIGVsZW1lbnQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IsIGVscykpIHtcblxuICAgICAgICAgICAgICAgICAgICB0YXJnZXRzLnB1c2goaW50ZXJhY3RhYmxlKTtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHdoaWxlIChlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0LmlzU2V0KGVsZW1lbnQpICYmIGludGVyYWN0KGVsZW1lbnQpLl9pRXZlbnRzW2V2ZW50VHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0cy5wdXNoKGludGVyYWN0KGVsZW1lbnQpKTtcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudHMucHVzaChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3Rvcihjb2xsZWN0U2VsZWN0b3JzKTtcblxuICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjcmVhdGUgdGhlIHRhcCBldmVudCBldmVuIGlmIHRoZXJlIGFyZSBubyBsaXN0ZW5lcnMgc28gdGhhdFxuICAgICAgICAgICAgLy8gZG91YmxldGFwIGNhbiBzdGlsbCBiZSBjcmVhdGVkIGFuZCBmaXJlZFxuICAgICAgICAgICAgaWYgKHRhcmdldHMubGVuZ3RoIHx8IGV2ZW50VHlwZSA9PT0gJ3RhcCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmZpcmVQb2ludGVycyhwb2ludGVyLCBldmVudCwgZXZlbnRUYXJnZXQsIHRhcmdldHMsIGVsZW1lbnRzLCBldmVudFR5cGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGZpcmVQb2ludGVyczogZnVuY3Rpb24gKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgdGFyZ2V0cywgZWxlbWVudHMsIGV2ZW50VHlwZSkge1xuICAgICAgICAgICAgdmFyIHBvaW50ZXJJbmRleCA9IHRoaXMubW91c2U/IDAgOiBpbmRleE9mKGdldFBvaW50ZXJJZChwb2ludGVyKSksXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50ID0ge30sXG4gICAgICAgICAgICAgICAgaSxcbiAgICAgICAgICAgICAgICAvLyBmb3IgdGFwIGV2ZW50c1xuICAgICAgICAgICAgICAgIGludGVydmFsLCBjcmVhdGVOZXdEb3VibGVUYXA7XG5cbiAgICAgICAgICAgIC8vIGlmIGl0J3MgYSBkb3VibGV0YXAgdGhlbiB0aGUgZXZlbnQgcHJvcGVydGllcyB3b3VsZCBoYXZlIGJlZW5cbiAgICAgICAgICAgIC8vIGNvcGllZCBmcm9tIHRoZSB0YXAgZXZlbnQgYW5kIHByb3ZpZGVkIGFzIHRoZSBwb2ludGVyIGFyZ3VtZW50XG4gICAgICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnZG91YmxldGFwJykge1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudCA9IHBvaW50ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBleHRlbmQocG9pbnRlckV2ZW50LCBldmVudCk7XG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50ICE9PSBwb2ludGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIGV4dGVuZChwb2ludGVyRXZlbnQsIHBvaW50ZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5wcmV2ZW50RGVmYXVsdCAgICAgICAgICAgPSBwcmV2ZW50T3JpZ2luYWxEZWZhdWx0O1xuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC5zdG9wUHJvcGFnYXRpb24gICAgICAgICAgPSBJbnRlcmFjdEV2ZW50LnByb3RvdHlwZS5zdG9wUHJvcGFnYXRpb247XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbiA9IEludGVyYWN0RXZlbnQucHJvdG90eXBlLnN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbjtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuaW50ZXJhY3Rpb24gICAgICAgICAgICAgID0gdGhpcztcblxuICAgICAgICAgICAgICAgIHBvaW50ZXJFdmVudC50aW1lU3RhbXAgICAgID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50Lm9yaWdpbmFsRXZlbnQgPSBldmVudDtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQudHlwZSAgICAgICAgICA9IGV2ZW50VHlwZTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQucG9pbnRlcklkICAgICA9IGdldFBvaW50ZXJJZChwb2ludGVyKTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQucG9pbnRlclR5cGUgICA9IHRoaXMubW91c2U/ICdtb3VzZScgOiAhc3VwcG9ydHNQb2ludGVyRXZlbnQ/ICd0b3VjaCdcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGlzU3RyaW5nKHBvaW50ZXIucG9pbnRlclR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gcG9pbnRlci5wb2ludGVyVHlwZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFssLCd0b3VjaCcsICdwZW4nLCAnbW91c2UnXVtwb2ludGVyLnBvaW50ZXJUeXBlXTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGV2ZW50VHlwZSA9PT0gJ3RhcCcpIHtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuZHQgPSBwb2ludGVyRXZlbnQudGltZVN0YW1wIC0gdGhpcy5kb3duVGltZXNbcG9pbnRlckluZGV4XTtcblxuICAgICAgICAgICAgICAgIGludGVydmFsID0gcG9pbnRlckV2ZW50LnRpbWVTdGFtcCAtIHRoaXMudGFwVGltZTtcbiAgICAgICAgICAgICAgICBjcmVhdGVOZXdEb3VibGVUYXAgPSAhISh0aGlzLnByZXZUYXAgJiYgdGhpcy5wcmV2VGFwLnR5cGUgIT09ICdkb3VibGV0YXAnXG4gICAgICAgICAgICAgICAgICAgICAgICYmIHRoaXMucHJldlRhcC50YXJnZXQgPT09IHBvaW50ZXJFdmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgICAgJiYgaW50ZXJ2YWwgPCA1MDApO1xuXG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmRvdWJsZSA9IGNyZWF0ZU5ld0RvdWJsZVRhcDtcblxuICAgICAgICAgICAgICAgIHRoaXMudGFwVGltZSA9IHBvaW50ZXJFdmVudC50aW1lU3RhbXA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCB0YXJnZXRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcG9pbnRlckV2ZW50LmN1cnJlbnRUYXJnZXQgPSBlbGVtZW50c1tpXTtcbiAgICAgICAgICAgICAgICBwb2ludGVyRXZlbnQuaW50ZXJhY3RhYmxlID0gdGFyZ2V0c1tpXTtcbiAgICAgICAgICAgICAgICB0YXJnZXRzW2ldLmZpcmUocG9pbnRlckV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGlmIChwb2ludGVyRXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkXG4gICAgICAgICAgICAgICAgICAgIHx8KHBvaW50ZXJFdmVudC5wcm9wYWdhdGlvblN0b3BwZWQgJiYgZWxlbWVudHNbaSArIDFdICE9PSBwb2ludGVyRXZlbnQuY3VycmVudFRhcmdldCkpIHtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoY3JlYXRlTmV3RG91YmxlVGFwKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRvdWJsZVRhcCA9IHt9O1xuXG4gICAgICAgICAgICAgICAgZXh0ZW5kKGRvdWJsZVRhcCwgcG9pbnRlckV2ZW50KTtcblxuICAgICAgICAgICAgICAgIGRvdWJsZVRhcC5kdCAgID0gaW50ZXJ2YWw7XG4gICAgICAgICAgICAgICAgZG91YmxlVGFwLnR5cGUgPSAnZG91YmxldGFwJztcblxuICAgICAgICAgICAgICAgIHRoaXMuY29sbGVjdEV2ZW50VGFyZ2V0cyhkb3VibGVUYXAsIGV2ZW50LCBldmVudFRhcmdldCwgJ2RvdWJsZXRhcCcpO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5wcmV2VGFwID0gZG91YmxlVGFwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZXZlbnRUeXBlID09PSAndGFwJykge1xuICAgICAgICAgICAgICAgIHRoaXMucHJldlRhcCA9IHBvaW50ZXJFdmVudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICB2YWxpZGF0ZVNlbGVjdG9yOiBmdW5jdGlvbiAocG9pbnRlciwgbWF0Y2hlcywgbWF0Y2hFbGVtZW50cykge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IG1hdGNoZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgbWF0Y2ggPSBtYXRjaGVzW2ldLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaEVsZW1lbnQgPSBtYXRjaEVsZW1lbnRzW2ldLFxuICAgICAgICAgICAgICAgICAgICBhY3Rpb24gPSB2YWxpZGF0ZUFjdGlvbihtYXRjaC5nZXRBY3Rpb24ocG9pbnRlciwgdGhpcywgbWF0Y2hFbGVtZW50KSwgbWF0Y2gpO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFjdGlvbiAmJiB3aXRoaW5JbnRlcmFjdGlvbkxpbWl0KG1hdGNoLCBtYXRjaEVsZW1lbnQsIGFjdGlvbikpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy50YXJnZXQgPSBtYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5lbGVtZW50ID0gbWF0Y2hFbGVtZW50O1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhY3Rpb247XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldFNuYXBwaW5nOiBmdW5jdGlvbiAocGFnZUNvb3Jkcywgc3RhdHVzKSB7XG4gICAgICAgICAgICB2YXIgc25hcCA9IHRoaXMudGFyZ2V0Lm9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXS5zbmFwLFxuICAgICAgICAgICAgICAgIHRhcmdldHMgPSBbXSxcbiAgICAgICAgICAgICAgICB0YXJnZXQsXG4gICAgICAgICAgICAgICAgcGFnZSxcbiAgICAgICAgICAgICAgICBpO1xuXG4gICAgICAgICAgICBzdGF0dXMgPSBzdGF0dXMgfHwgdGhpcy5zbmFwU3RhdHVzO1xuXG4gICAgICAgICAgICBpZiAoc3RhdHVzLnVzZVN0YXR1c1hZKSB7XG4gICAgICAgICAgICAgICAgcGFnZSA9IHsgeDogc3RhdHVzLngsIHk6IHN0YXR1cy55IH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgb3JpZ2luID0gZ2V0T3JpZ2luWFkodGhpcy50YXJnZXQsIHRoaXMuZWxlbWVudCk7XG5cbiAgICAgICAgICAgICAgICBwYWdlID0gZXh0ZW5kKHt9LCBwYWdlQ29vcmRzKTtcblxuICAgICAgICAgICAgICAgIHBhZ2UueCAtPSBvcmlnaW4ueDtcbiAgICAgICAgICAgICAgICBwYWdlLnkgLT0gb3JpZ2luLnk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXR1cy5yZWFsWCA9IHBhZ2UueDtcbiAgICAgICAgICAgIHN0YXR1cy5yZWFsWSA9IHBhZ2UueTtcblxuICAgICAgICAgICAgcGFnZS54ID0gcGFnZS54IC0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR4O1xuICAgICAgICAgICAgcGFnZS55ID0gcGFnZS55IC0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR5O1xuXG4gICAgICAgICAgICB2YXIgbGVuID0gc25hcC50YXJnZXRzPyBzbmFwLnRhcmdldHMubGVuZ3RoIDogMDtcblxuICAgICAgICAgICAgZm9yICh2YXIgcmVsSW5kZXggPSAwOyByZWxJbmRleCA8IHRoaXMuc25hcE9mZnNldHMubGVuZ3RoOyByZWxJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlbGF0aXZlID0ge1xuICAgICAgICAgICAgICAgICAgICB4OiBwYWdlLnggLSB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS54LFxuICAgICAgICAgICAgICAgICAgICB5OiBwYWdlLnkgLSB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS55XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihzbmFwLnRhcmdldHNbaV0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzbmFwLnRhcmdldHNbaV0ocmVsYXRpdmUueCwgcmVsYXRpdmUueSwgdGhpcyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXQgPSBzbmFwLnRhcmdldHNbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXRhcmdldCkgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgICAgIHRhcmdldHMucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICB4OiBpc051bWJlcih0YXJnZXQueCkgPyAodGFyZ2V0LnggKyB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS54KSA6IHJlbGF0aXZlLngsXG4gICAgICAgICAgICAgICAgICAgICAgICB5OiBpc051bWJlcih0YXJnZXQueSkgPyAodGFyZ2V0LnkgKyB0aGlzLnNuYXBPZmZzZXRzW3JlbEluZGV4XS55KSA6IHJlbGF0aXZlLnksXG5cbiAgICAgICAgICAgICAgICAgICAgICAgIHJhbmdlOiBpc051bWJlcih0YXJnZXQucmFuZ2UpPyB0YXJnZXQucmFuZ2U6IHNuYXAucmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgY2xvc2VzdCA9IHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0OiBudWxsLFxuICAgICAgICAgICAgICAgICAgICBpblJhbmdlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgZGlzdGFuY2U6IDAsXG4gICAgICAgICAgICAgICAgICAgIHJhbmdlOiAwLFxuICAgICAgICAgICAgICAgICAgICBkeDogMCxcbiAgICAgICAgICAgICAgICAgICAgZHk6IDBcbiAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSB0YXJnZXRzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gdGFyZ2V0c1tpXTtcblxuICAgICAgICAgICAgICAgIHZhciByYW5nZSA9IHRhcmdldC5yYW5nZSxcbiAgICAgICAgICAgICAgICAgICAgZHggPSB0YXJnZXQueCAtIHBhZ2UueCxcbiAgICAgICAgICAgICAgICAgICAgZHkgPSB0YXJnZXQueSAtIHBhZ2UueSxcbiAgICAgICAgICAgICAgICAgICAgZGlzdGFuY2UgPSBoeXBvdChkeCwgZHkpLFxuICAgICAgICAgICAgICAgICAgICBpblJhbmdlID0gZGlzdGFuY2UgPD0gcmFuZ2U7XG5cbiAgICAgICAgICAgICAgICAvLyBJbmZpbml0ZSB0YXJnZXRzIGNvdW50IGFzIGJlaW5nIG91dCBvZiByYW5nZVxuICAgICAgICAgICAgICAgIC8vIGNvbXBhcmVkIHRvIG5vbiBpbmZpbml0ZSBvbmVzIHRoYXQgYXJlIGluIHJhbmdlXG4gICAgICAgICAgICAgICAgaWYgKHJhbmdlID09PSBJbmZpbml0eSAmJiBjbG9zZXN0LmluUmFuZ2UgJiYgY2xvc2VzdC5yYW5nZSAhPT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgaW5SYW5nZSA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghY2xvc2VzdC50YXJnZXQgfHwgKGluUmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgLy8gaXMgdGhlIGNsb3Nlc3QgdGFyZ2V0IGluIHJhbmdlP1xuICAgICAgICAgICAgICAgICAgICA/IChjbG9zZXN0LmluUmFuZ2UgJiYgcmFuZ2UgIT09IEluZmluaXR5XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyB0aGUgcG9pbnRlciBpcyByZWxhdGl2ZWx5IGRlZXBlciBpbiB0aGlzIHRhcmdldFxuICAgICAgICAgICAgICAgICAgICAgICAgPyBkaXN0YW5jZSAvIHJhbmdlIDwgY2xvc2VzdC5kaXN0YW5jZSAvIGNsb3Nlc3QucmFuZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRoaXMgdGFyZ2V0IGhhcyBJbmZpbml0ZSByYW5nZSBhbmQgdGhlIGNsb3Nlc3QgZG9lc24ndFxuICAgICAgICAgICAgICAgICAgICAgICAgOiAocmFuZ2UgPT09IEluZmluaXR5ICYmIGNsb3Nlc3QucmFuZ2UgIT09IEluZmluaXR5KVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE9SIHRoaXMgdGFyZ2V0IGlzIGNsb3NlciB0aGF0IHRoZSBwcmV2aW91cyBjbG9zZXN0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfHwgZGlzdGFuY2UgPCBjbG9zZXN0LmRpc3RhbmNlKVxuICAgICAgICAgICAgICAgICAgICAvLyBUaGUgb3RoZXIgaXMgbm90IGluIHJhbmdlIGFuZCB0aGUgcG9pbnRlciBpcyBjbG9zZXIgdG8gdGhpcyB0YXJnZXRcbiAgICAgICAgICAgICAgICAgICAgOiAoIWNsb3Nlc3QuaW5SYW5nZSAmJiBkaXN0YW5jZSA8IGNsb3Nlc3QuZGlzdGFuY2UpKSkge1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyYW5nZSA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGluUmFuZ2UgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC50YXJnZXQgPSB0YXJnZXQ7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuZGlzdGFuY2UgPSBkaXN0YW5jZTtcbiAgICAgICAgICAgICAgICAgICAgY2xvc2VzdC5yYW5nZSA9IHJhbmdlO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LmluUmFuZ2UgPSBpblJhbmdlO1xuICAgICAgICAgICAgICAgICAgICBjbG9zZXN0LmR4ID0gZHg7XG4gICAgICAgICAgICAgICAgICAgIGNsb3Nlc3QuZHkgPSBkeTtcblxuICAgICAgICAgICAgICAgICAgICBzdGF0dXMucmFuZ2UgPSByYW5nZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBzbmFwQ2hhbmdlZDtcblxuICAgICAgICAgICAgaWYgKGNsb3Nlc3QudGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgc25hcENoYW5nZWQgPSAoc3RhdHVzLnNuYXBwZWRYICE9PSBjbG9zZXN0LnRhcmdldC54IHx8IHN0YXR1cy5zbmFwcGVkWSAhPT0gY2xvc2VzdC50YXJnZXQueSk7XG5cbiAgICAgICAgICAgICAgICBzdGF0dXMuc25hcHBlZFggPSBjbG9zZXN0LnRhcmdldC54O1xuICAgICAgICAgICAgICAgIHN0YXR1cy5zbmFwcGVkWSA9IGNsb3Nlc3QudGFyZ2V0Lnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBzbmFwQ2hhbmdlZCA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICBzdGF0dXMuc25hcHBlZFggPSBOYU47XG4gICAgICAgICAgICAgICAgc3RhdHVzLnNuYXBwZWRZID0gTmFOO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0dXMuZHggPSBjbG9zZXN0LmR4O1xuICAgICAgICAgICAgc3RhdHVzLmR5ID0gY2xvc2VzdC5keTtcblxuICAgICAgICAgICAgc3RhdHVzLmNoYW5nZWQgPSAoc25hcENoYW5nZWQgfHwgKGNsb3Nlc3QuaW5SYW5nZSAmJiAhc3RhdHVzLmxvY2tlZCkpO1xuICAgICAgICAgICAgc3RhdHVzLmxvY2tlZCA9IGNsb3Nlc3QuaW5SYW5nZTtcblxuICAgICAgICAgICAgcmV0dXJuIHN0YXR1cztcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRSZXN0cmljdGlvbjogZnVuY3Rpb24gKHBhZ2VDb29yZHMsIHN0YXR1cykge1xuICAgICAgICAgICAgdmFyIHRhcmdldCA9IHRoaXMudGFyZ2V0LFxuICAgICAgICAgICAgICAgIHJlc3RyaWN0ID0gdGFyZ2V0ICYmIHRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ucmVzdHJpY3QsXG4gICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSByZXN0cmljdCAmJiByZXN0cmljdC5yZXN0cmljdGlvbixcbiAgICAgICAgICAgICAgICBwYWdlO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHN0YXR1cztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdHVzID0gc3RhdHVzIHx8IHRoaXMucmVzdHJpY3RTdGF0dXM7XG5cbiAgICAgICAgICAgIHBhZ2UgPSBzdGF0dXMudXNlU3RhdHVzWFlcbiAgICAgICAgICAgICAgICAgICAgPyBwYWdlID0geyB4OiBzdGF0dXMueCwgeTogc3RhdHVzLnkgfVxuICAgICAgICAgICAgICAgICAgICA6IHBhZ2UgPSBleHRlbmQoe30sIHBhZ2VDb29yZHMpO1xuXG4gICAgICAgICAgICBpZiAoc3RhdHVzLnNuYXAgJiYgc3RhdHVzLnNuYXAubG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgcGFnZS54ICs9IHN0YXR1cy5zbmFwLmR4IHx8IDA7XG4gICAgICAgICAgICAgICAgcGFnZS55ICs9IHN0YXR1cy5zbmFwLmR5IHx8IDA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHBhZ2UueCAtPSB0aGlzLmluZXJ0aWFTdGF0dXMucmVzdW1lRHg7XG4gICAgICAgICAgICBwYWdlLnkgLT0gdGhpcy5pbmVydGlhU3RhdHVzLnJlc3VtZUR5O1xuXG4gICAgICAgICAgICBzdGF0dXMuZHggPSAwO1xuICAgICAgICAgICAgc3RhdHVzLmR5ID0gMDtcbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIHZhciByZWN0LCByZXN0cmljdGVkWCwgcmVzdHJpY3RlZFk7XG5cbiAgICAgICAgICAgIGlmIChpc1N0cmluZyhyZXN0cmljdGlvbikpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVzdHJpY3Rpb24gPT09ICdwYXJlbnQnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gcGFyZW50RWxlbWVudCh0aGlzLmVsZW1lbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChyZXN0cmljdGlvbiA9PT0gJ3NlbGYnKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gdGFyZ2V0LmdldFJlY3QodGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uID0gY2xvc2VzdCh0aGlzLmVsZW1lbnQsIHJlc3RyaWN0aW9uKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7IHJldHVybiBzdGF0dXM7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocmVzdHJpY3Rpb24pKSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3Rpb24gPSByZXN0cmljdGlvbihwYWdlLngsIHBhZ2UueSwgdGhpcy5lbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChyZXN0cmljdGlvbikpIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGlvbiA9IGdldEVsZW1lbnRSZWN0KHJlc3RyaWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmVjdCA9IHJlc3RyaWN0aW9uO1xuXG4gICAgICAgICAgICBpZiAoIXJlc3RyaWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFggPSBwYWdlLng7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFkgPSBwYWdlLnk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBvYmplY3QgaXMgYXNzdW1lZCB0byBoYXZlXG4gICAgICAgICAgICAvLyB4LCB5LCB3aWR0aCwgaGVpZ2h0IG9yXG4gICAgICAgICAgICAvLyBsZWZ0LCB0b3AsIHJpZ2h0LCBib3R0b21cbiAgICAgICAgICAgIGVsc2UgaWYgKCd4JyBpbiByZXN0cmljdGlvbiAmJiAneScgaW4gcmVzdHJpY3Rpb24pIHtcbiAgICAgICAgICAgICAgICByZXN0cmljdGVkWCA9IE1hdGgubWF4KE1hdGgubWluKHJlY3QueCArIHJlY3Qud2lkdGggIC0gdGhpcy5yZXN0cmljdE9mZnNldC5yaWdodCAsIHBhZ2UueCksIHJlY3QueCArIHRoaXMucmVzdHJpY3RPZmZzZXQubGVmdCk7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFkgPSBNYXRoLm1heChNYXRoLm1pbihyZWN0LnkgKyByZWN0LmhlaWdodCAtIHRoaXMucmVzdHJpY3RPZmZzZXQuYm90dG9tLCBwYWdlLnkpLCByZWN0LnkgKyB0aGlzLnJlc3RyaWN0T2Zmc2V0LnRvcCApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgcmVzdHJpY3RlZFggPSBNYXRoLm1heChNYXRoLm1pbihyZWN0LnJpZ2h0ICAtIHRoaXMucmVzdHJpY3RPZmZzZXQucmlnaHQgLCBwYWdlLngpLCByZWN0LmxlZnQgKyB0aGlzLnJlc3RyaWN0T2Zmc2V0LmxlZnQpO1xuICAgICAgICAgICAgICAgIHJlc3RyaWN0ZWRZID0gTWF0aC5tYXgoTWF0aC5taW4ocmVjdC5ib3R0b20gLSB0aGlzLnJlc3RyaWN0T2Zmc2V0LmJvdHRvbSwgcGFnZS55KSwgcmVjdC50b3AgICsgdGhpcy5yZXN0cmljdE9mZnNldC50b3AgKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgc3RhdHVzLmR4ID0gcmVzdHJpY3RlZFggLSBwYWdlLng7XG4gICAgICAgICAgICBzdGF0dXMuZHkgPSByZXN0cmljdGVkWSAtIHBhZ2UueTtcblxuICAgICAgICAgICAgc3RhdHVzLmNoYW5nZWQgPSBzdGF0dXMucmVzdHJpY3RlZFggIT09IHJlc3RyaWN0ZWRYIHx8IHN0YXR1cy5yZXN0cmljdGVkWSAhPT0gcmVzdHJpY3RlZFk7XG4gICAgICAgICAgICBzdGF0dXMucmVzdHJpY3RlZCA9ICEhKHN0YXR1cy5keCB8fCBzdGF0dXMuZHkpO1xuXG4gICAgICAgICAgICBzdGF0dXMucmVzdHJpY3RlZFggPSByZXN0cmljdGVkWDtcbiAgICAgICAgICAgIHN0YXR1cy5yZXN0cmljdGVkWSA9IHJlc3RyaWN0ZWRZO1xuXG4gICAgICAgICAgICByZXR1cm4gc3RhdHVzO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNoZWNrQW5kUHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChldmVudCwgaW50ZXJhY3RhYmxlLCBlbGVtZW50KSB7XG4gICAgICAgICAgICBpZiAoIShpbnRlcmFjdGFibGUgPSBpbnRlcmFjdGFibGUgfHwgdGhpcy50YXJnZXQpKSB7IHJldHVybjsgfVxuXG4gICAgICAgICAgICB2YXIgb3B0aW9ucyA9IGludGVyYWN0YWJsZS5vcHRpb25zLFxuICAgICAgICAgICAgICAgIHByZXZlbnQgPSBvcHRpb25zLnByZXZlbnREZWZhdWx0O1xuXG4gICAgICAgICAgICBpZiAocHJldmVudCA9PT0gJ2F1dG8nICYmIGVsZW1lbnQgJiYgIS9eaW5wdXQkfF50ZXh0YXJlYSQvaS50ZXN0KGVsZW1lbnQubm9kZU5hbWUpKSB7XG4gICAgICAgICAgICAgICAgLy8gZG8gbm90IHByZXZlbnREZWZhdWx0IG9uIHBvaW50ZXJkb3duIGlmIHRoZSBwcmVwYXJlZCBhY3Rpb24gaXMgYSBkcmFnXG4gICAgICAgICAgICAgICAgLy8gYW5kIGRyYWdnaW5nIGNhbiBvbmx5IHN0YXJ0IGZyb20gYSBjZXJ0YWluIGRpcmVjdGlvbiAtIHRoaXMgYWxsb3dzXG4gICAgICAgICAgICAgICAgLy8gYSB0b3VjaCB0byBwYW4gdGhlIHZpZXdwb3J0IGlmIGEgZHJhZyBpc24ndCBpbiB0aGUgcmlnaHQgZGlyZWN0aW9uXG4gICAgICAgICAgICAgICAgaWYgKC9kb3dufHN0YXJ0L2kudGVzdChldmVudC50eXBlKVxuICAgICAgICAgICAgICAgICAgICAmJiB0aGlzLnByZXBhcmVkLm5hbWUgPT09ICdkcmFnJyAmJiBvcHRpb25zLmRyYWcuYXhpcyAhPT0gJ3h5Jykge1xuXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyB3aXRoIG1hbnVhbFN0YXJ0LCBvbmx5IHByZXZlbnREZWZhdWx0IHdoaWxlIGludGVyYWN0aW5nXG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbnNbdGhpcy5wcmVwYXJlZC5uYW1lXSAmJiBvcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0ubWFudWFsU3RhcnRcbiAgICAgICAgICAgICAgICAgICAgJiYgIXRoaXMuaW50ZXJhY3RpbmcoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChwcmV2ZW50ID09PSAnYWx3YXlzJykge1xuICAgICAgICAgICAgICAgIGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGNhbGNJbmVydGlhOiBmdW5jdGlvbiAoc3RhdHVzKSB7XG4gICAgICAgICAgICB2YXIgaW5lcnRpYU9wdGlvbnMgPSB0aGlzLnRhcmdldC5vcHRpb25zW3RoaXMucHJlcGFyZWQubmFtZV0uaW5lcnRpYSxcbiAgICAgICAgICAgICAgICBsYW1iZGEgPSBpbmVydGlhT3B0aW9ucy5yZXNpc3RhbmNlLFxuICAgICAgICAgICAgICAgIGluZXJ0aWFEdXIgPSAtTWF0aC5sb2coaW5lcnRpYU9wdGlvbnMuZW5kU3BlZWQgLyBzdGF0dXMudjApIC8gbGFtYmRhO1xuXG4gICAgICAgICAgICBzdGF0dXMueDAgPSB0aGlzLnByZXZFdmVudC5wYWdlWDtcbiAgICAgICAgICAgIHN0YXR1cy55MCA9IHRoaXMucHJldkV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgc3RhdHVzLnQwID0gc3RhdHVzLnN0YXJ0RXZlbnQudGltZVN0YW1wIC8gMTAwMDtcbiAgICAgICAgICAgIHN0YXR1cy5zeCA9IHN0YXR1cy5zeSA9IDA7XG5cbiAgICAgICAgICAgIHN0YXR1cy5tb2RpZmllZFhlID0gc3RhdHVzLnhlID0gKHN0YXR1cy52eDAgLSBpbmVydGlhRHVyKSAvIGxhbWJkYTtcbiAgICAgICAgICAgIHN0YXR1cy5tb2RpZmllZFllID0gc3RhdHVzLnllID0gKHN0YXR1cy52eTAgLSBpbmVydGlhRHVyKSAvIGxhbWJkYTtcbiAgICAgICAgICAgIHN0YXR1cy50ZSA9IGluZXJ0aWFEdXI7XG5cbiAgICAgICAgICAgIHN0YXR1cy5sYW1iZGFfdjAgPSBsYW1iZGEgLyBzdGF0dXMudjA7XG4gICAgICAgICAgICBzdGF0dXMub25lX3ZlX3YwID0gMSAtIGluZXJ0aWFPcHRpb25zLmVuZFNwZWVkIC8gc3RhdHVzLnYwO1xuICAgICAgICB9LFxuXG4gICAgICAgIF91cGRhdGVFdmVudFRhcmdldHM6IGZ1bmN0aW9uICh0YXJnZXQsIGN1cnJlbnRUYXJnZXQpIHtcbiAgICAgICAgICAgIHRoaXMuX2V2ZW50VGFyZ2V0ICAgID0gdGFyZ2V0O1xuICAgICAgICAgICAgdGhpcy5fY3VyRXZlbnRUYXJnZXQgPSBjdXJyZW50VGFyZ2V0O1xuICAgICAgICB9XG5cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gZ2V0SW50ZXJhY3Rpb25Gcm9tUG9pbnRlciAocG9pbnRlciwgZXZlbnRUeXBlLCBldmVudFRhcmdldCkge1xuICAgICAgICB2YXIgaSA9IDAsIGxlbiA9IGludGVyYWN0aW9ucy5sZW5ndGgsXG4gICAgICAgICAgICBtb3VzZUV2ZW50ID0gKC9tb3VzZS9pLnRlc3QocG9pbnRlci5wb2ludGVyVHlwZSB8fCBldmVudFR5cGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgIC8vIE1TUG9pbnRlckV2ZW50Lk1TUE9JTlRFUl9UWVBFX01PVVNFXG4gICAgICAgICAgICAgICAgICAgICAgICAgIHx8IHBvaW50ZXIucG9pbnRlclR5cGUgPT09IDQpLFxuICAgICAgICAgICAgaW50ZXJhY3Rpb247XG5cbiAgICAgICAgdmFyIGlkID0gZ2V0UG9pbnRlcklkKHBvaW50ZXIpO1xuXG4gICAgICAgIC8vIHRyeSB0byByZXN1bWUgaW5lcnRpYSB3aXRoIGEgbmV3IHBvaW50ZXJcbiAgICAgICAgaWYgKC9kb3dufHN0YXJ0L2kudGVzdChldmVudFR5cGUpKSB7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgICAgIHZhciBlbGVtZW50ID0gZXZlbnRUYXJnZXQ7XG5cbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24uaW5lcnRpYVN0YXR1cy5hY3RpdmUgJiYgaW50ZXJhY3Rpb24udGFyZ2V0Lm9wdGlvbnNbaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZV0uaW5lcnRpYS5hbGxvd1Jlc3VtZVxuICAgICAgICAgICAgICAgICAgICAmJiAoaW50ZXJhY3Rpb24ubW91c2UgPT09IG1vdXNlRXZlbnQpKSB7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgZWxlbWVudCBpcyB0aGUgaW50ZXJhY3Rpb24gZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnQgPT09IGludGVyYWN0aW9uLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgdGhlIGludGVyYWN0aW9uJ3MgcG9pbnRlclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpbnRlcmFjdGlvbi5wb2ludGVyc1swXSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5yZW1vdmVQb2ludGVyKGludGVyYWN0aW9uLnBvaW50ZXJzWzBdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3Rpb24uYWRkUG9pbnRlcihwb2ludGVyKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQgPSBwYXJlbnRFbGVtZW50KGVsZW1lbnQpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgaXQncyBhIG1vdXNlIGludGVyYWN0aW9uXG4gICAgICAgIGlmIChtb3VzZUV2ZW50IHx8ICEoc3VwcG9ydHNUb3VjaCB8fCBzdXBwb3J0c1BvaW50ZXJFdmVudCkpIHtcblxuICAgICAgICAgICAgLy8gZmluZCBhIG1vdXNlIGludGVyYWN0aW9uIHRoYXQncyBub3QgaW4gaW5lcnRpYSBwaGFzZVxuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uc1tpXS5tb3VzZSAmJiAhaW50ZXJhY3Rpb25zW2ldLmluZXJ0aWFTdGF0dXMuYWN0aXZlKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbnNbaV07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBmaW5kIGFueSBpbnRlcmFjdGlvbiBzcGVjaWZpY2FsbHkgZm9yIG1vdXNlLlxuICAgICAgICAgICAgLy8gaWYgdGhlIGV2ZW50VHlwZSBpcyBhIG1vdXNlZG93biwgYW5kIGluZXJ0aWEgaXMgYWN0aXZlXG4gICAgICAgICAgICAvLyBpZ25vcmUgdGhlIGludGVyYWN0aW9uXG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb25zW2ldLm1vdXNlICYmICEoL2Rvd24vLnRlc3QoZXZlbnRUeXBlKSAmJiBpbnRlcmFjdGlvbnNbaV0uaW5lcnRpYVN0YXR1cy5hY3RpdmUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIGNyZWF0ZSBhIG5ldyBpbnRlcmFjdGlvbiBmb3IgbW91c2VcbiAgICAgICAgICAgIGludGVyYWN0aW9uID0gbmV3IEludGVyYWN0aW9uKCk7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbi5tb3VzZSA9IHRydWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGdldCBpbnRlcmFjdGlvbiB0aGF0IGhhcyB0aGlzIHBvaW50ZXJcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpZiAoY29udGFpbnMoaW50ZXJhY3Rpb25zW2ldLnBvaW50ZXJJZHMsIGlkKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdGlvbnNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBhdCB0aGlzIHN0YWdlLCBhIHBvaW50ZXJVcCBzaG91bGQgbm90IHJldHVybiBhbiBpbnRlcmFjdGlvblxuICAgICAgICBpZiAoL3VwfGVuZHxvdXQvaS50ZXN0KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gZ2V0IGZpcnN0IGlkbGUgaW50ZXJhY3Rpb25cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgaWYgKCghaW50ZXJhY3Rpb24ucHJlcGFyZWQubmFtZSB8fCAoaW50ZXJhY3Rpb24udGFyZ2V0Lm9wdGlvbnMuZ2VzdHVyZS5lbmFibGVkKSlcbiAgICAgICAgICAgICAgICAmJiAhaW50ZXJhY3Rpb24uaW50ZXJhY3RpbmcoKVxuICAgICAgICAgICAgICAgICYmICEoIW1vdXNlRXZlbnQgJiYgaW50ZXJhY3Rpb24ubW91c2UpKSB7XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5hZGRQb2ludGVyKHBvaW50ZXIpO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0aW9uO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG5ldyBJbnRlcmFjdGlvbigpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRvT25JbnRlcmFjdGlvbnMgKG1ldGhvZCkge1xuICAgICAgICByZXR1cm4gKGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgdmFyIGludGVyYWN0aW9uLFxuICAgICAgICAgICAgICAgIGV2ZW50VGFyZ2V0ID0gZ2V0QWN0dWFsRWxlbWVudChldmVudC5wYXRoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZXZlbnQucGF0aFswXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IGV2ZW50LnRhcmdldCksXG4gICAgICAgICAgICAgICAgY3VyRXZlbnRUYXJnZXQgPSBnZXRBY3R1YWxFbGVtZW50KGV2ZW50LmN1cnJlbnRUYXJnZXQpLFxuICAgICAgICAgICAgICAgIGk7XG5cbiAgICAgICAgICAgIGlmIChzdXBwb3J0c1RvdWNoICYmIC90b3VjaC8udGVzdChldmVudC50eXBlKSkge1xuICAgICAgICAgICAgICAgIHByZXZUb3VjaFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblxuICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBldmVudC5jaGFuZ2VkVG91Y2hlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgcG9pbnRlciA9IGV2ZW50LmNoYW5nZWRUb3VjaGVzW2ldO1xuXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uID0gZ2V0SW50ZXJhY3Rpb25Gcm9tUG9pbnRlcihwb2ludGVyLCBldmVudC50eXBlLCBldmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbikgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgICAgIGludGVyYWN0aW9uLl91cGRhdGVFdmVudFRhcmdldHMoZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvblttZXRob2RdKHBvaW50ZXIsIGV2ZW50LCBldmVudFRhcmdldCwgY3VyRXZlbnRUYXJnZXQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghc3VwcG9ydHNQb2ludGVyRXZlbnQgJiYgL21vdXNlLy50ZXN0KGV2ZW50LnR5cGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGlnbm9yZSBtb3VzZSBldmVudHMgd2hpbGUgdG91Y2ggaW50ZXJhY3Rpb25zIGFyZSBhY3RpdmVcbiAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGludGVyYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFpbnRlcmFjdGlvbnNbaV0ubW91c2UgJiYgaW50ZXJhY3Rpb25zW2ldLnBvaW50ZXJJc0Rvd24pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyB0cnkgdG8gaWdub3JlIG1vdXNlIGV2ZW50cyB0aGF0IGFyZSBzaW11bGF0ZWQgYnkgdGhlIGJyb3dzZXJcbiAgICAgICAgICAgICAgICAgICAgLy8gYWZ0ZXIgYSB0b3VjaCBldmVudFxuICAgICAgICAgICAgICAgICAgICBpZiAobmV3IERhdGUoKS5nZXRUaW1lKCkgLSBwcmV2VG91Y2hUaW1lIDwgNTAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbiA9IGdldEludGVyYWN0aW9uRnJvbVBvaW50ZXIoZXZlbnQsIGV2ZW50LnR5cGUsIGV2ZW50VGFyZ2V0KTtcblxuICAgICAgICAgICAgICAgIGlmICghaW50ZXJhY3Rpb24pIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5fdXBkYXRlRXZlbnRUYXJnZXRzKGV2ZW50VGFyZ2V0LCBjdXJFdmVudFRhcmdldCk7XG5cbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlvblttZXRob2RdKGV2ZW50LCBldmVudCwgZXZlbnRUYXJnZXQsIGN1ckV2ZW50VGFyZ2V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gSW50ZXJhY3RFdmVudCAoaW50ZXJhY3Rpb24sIGV2ZW50LCBhY3Rpb24sIHBoYXNlLCBlbGVtZW50LCByZWxhdGVkKSB7XG4gICAgICAgIHZhciBjbGllbnQsXG4gICAgICAgICAgICBwYWdlLFxuICAgICAgICAgICAgdGFyZ2V0ICAgICAgPSBpbnRlcmFjdGlvbi50YXJnZXQsXG4gICAgICAgICAgICBzbmFwU3RhdHVzICA9IGludGVyYWN0aW9uLnNuYXBTdGF0dXMsXG4gICAgICAgICAgICByZXN0cmljdFN0YXR1cyAgPSBpbnRlcmFjdGlvbi5yZXN0cmljdFN0YXR1cyxcbiAgICAgICAgICAgIHBvaW50ZXJzICAgID0gaW50ZXJhY3Rpb24ucG9pbnRlcnMsXG4gICAgICAgICAgICBkZWx0YVNvdXJjZSA9ICh0YXJnZXQgJiYgdGFyZ2V0Lm9wdGlvbnMgfHwgZGVmYXVsdE9wdGlvbnMpLmRlbHRhU291cmNlLFxuICAgICAgICAgICAgc291cmNlWCAgICAgPSBkZWx0YVNvdXJjZSArICdYJyxcbiAgICAgICAgICAgIHNvdXJjZVkgICAgID0gZGVsdGFTb3VyY2UgKyAnWScsXG4gICAgICAgICAgICBvcHRpb25zICAgICA9IHRhcmdldD8gdGFyZ2V0Lm9wdGlvbnM6IGRlZmF1bHRPcHRpb25zLFxuICAgICAgICAgICAgb3JpZ2luICAgICAgPSBnZXRPcmlnaW5YWSh0YXJnZXQsIGVsZW1lbnQpLFxuICAgICAgICAgICAgc3RhcnRpbmcgICAgPSBwaGFzZSA9PT0gJ3N0YXJ0JyxcbiAgICAgICAgICAgIGVuZGluZyAgICAgID0gcGhhc2UgPT09ICdlbmQnLFxuICAgICAgICAgICAgY29vcmRzICAgICAgPSBzdGFydGluZz8gaW50ZXJhY3Rpb24uc3RhcnRDb29yZHMgOiBpbnRlcmFjdGlvbi5jdXJDb29yZHM7XG5cbiAgICAgICAgZWxlbWVudCA9IGVsZW1lbnQgfHwgaW50ZXJhY3Rpb24uZWxlbWVudDtcblxuICAgICAgICBwYWdlICAgPSBleHRlbmQoe30sIGNvb3Jkcy5wYWdlKTtcbiAgICAgICAgY2xpZW50ID0gZXh0ZW5kKHt9LCBjb29yZHMuY2xpZW50KTtcblxuICAgICAgICBwYWdlLnggLT0gb3JpZ2luLng7XG4gICAgICAgIHBhZ2UueSAtPSBvcmlnaW4ueTtcblxuICAgICAgICBjbGllbnQueCAtPSBvcmlnaW4ueDtcbiAgICAgICAgY2xpZW50LnkgLT0gb3JpZ2luLnk7XG5cbiAgICAgICAgdmFyIHJlbGF0aXZlUG9pbnRzID0gb3B0aW9uc1thY3Rpb25dLnNuYXAgJiYgb3B0aW9uc1thY3Rpb25dLnNuYXAucmVsYXRpdmVQb2ludHMgO1xuXG4gICAgICAgIGlmIChjaGVja1NuYXAodGFyZ2V0LCBhY3Rpb24pICYmICEoc3RhcnRpbmcgJiYgcmVsYXRpdmVQb2ludHMgJiYgcmVsYXRpdmVQb2ludHMubGVuZ3RoKSkge1xuICAgICAgICAgICAgdGhpcy5zbmFwID0ge1xuICAgICAgICAgICAgICAgIHJhbmdlICA6IHNuYXBTdGF0dXMucmFuZ2UsXG4gICAgICAgICAgICAgICAgbG9ja2VkIDogc25hcFN0YXR1cy5sb2NrZWQsXG4gICAgICAgICAgICAgICAgeCAgICAgIDogc25hcFN0YXR1cy5zbmFwcGVkWCxcbiAgICAgICAgICAgICAgICB5ICAgICAgOiBzbmFwU3RhdHVzLnNuYXBwZWRZLFxuICAgICAgICAgICAgICAgIHJlYWxYICA6IHNuYXBTdGF0dXMucmVhbFgsXG4gICAgICAgICAgICAgICAgcmVhbFkgIDogc25hcFN0YXR1cy5yZWFsWSxcbiAgICAgICAgICAgICAgICBkeCAgICAgOiBzbmFwU3RhdHVzLmR4LFxuICAgICAgICAgICAgICAgIGR5ICAgICA6IHNuYXBTdGF0dXMuZHlcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGlmIChzbmFwU3RhdHVzLmxvY2tlZCkge1xuICAgICAgICAgICAgICAgIHBhZ2UueCArPSBzbmFwU3RhdHVzLmR4O1xuICAgICAgICAgICAgICAgIHBhZ2UueSArPSBzbmFwU3RhdHVzLmR5O1xuICAgICAgICAgICAgICAgIGNsaWVudC54ICs9IHNuYXBTdGF0dXMuZHg7XG4gICAgICAgICAgICAgICAgY2xpZW50LnkgKz0gc25hcFN0YXR1cy5keTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChjaGVja1Jlc3RyaWN0KHRhcmdldCwgYWN0aW9uKSAmJiAhKHN0YXJ0aW5nICYmIG9wdGlvbnNbYWN0aW9uXS5yZXN0cmljdC5lbGVtZW50UmVjdCkgJiYgcmVzdHJpY3RTdGF0dXMucmVzdHJpY3RlZCkge1xuICAgICAgICAgICAgcGFnZS54ICs9IHJlc3RyaWN0U3RhdHVzLmR4O1xuICAgICAgICAgICAgcGFnZS55ICs9IHJlc3RyaWN0U3RhdHVzLmR5O1xuICAgICAgICAgICAgY2xpZW50LnggKz0gcmVzdHJpY3RTdGF0dXMuZHg7XG4gICAgICAgICAgICBjbGllbnQueSArPSByZXN0cmljdFN0YXR1cy5keTtcblxuICAgICAgICAgICAgdGhpcy5yZXN0cmljdCA9IHtcbiAgICAgICAgICAgICAgICBkeDogcmVzdHJpY3RTdGF0dXMuZHgsXG4gICAgICAgICAgICAgICAgZHk6IHJlc3RyaWN0U3RhdHVzLmR5XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wYWdlWCAgICAgPSBwYWdlLng7XG4gICAgICAgIHRoaXMucGFnZVkgICAgID0gcGFnZS55O1xuICAgICAgICB0aGlzLmNsaWVudFggICA9IGNsaWVudC54O1xuICAgICAgICB0aGlzLmNsaWVudFkgICA9IGNsaWVudC55O1xuXG4gICAgICAgIHRoaXMueDAgICAgICAgID0gaW50ZXJhY3Rpb24uc3RhcnRDb29yZHMucGFnZS54O1xuICAgICAgICB0aGlzLnkwICAgICAgICA9IGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueTtcbiAgICAgICAgdGhpcy5jbGllbnRYMCAgPSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueDtcbiAgICAgICAgdGhpcy5jbGllbnRZMCAgPSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueTtcbiAgICAgICAgdGhpcy5jdHJsS2V5ICAgPSBldmVudC5jdHJsS2V5O1xuICAgICAgICB0aGlzLmFsdEtleSAgICA9IGV2ZW50LmFsdEtleTtcbiAgICAgICAgdGhpcy5zaGlmdEtleSAgPSBldmVudC5zaGlmdEtleTtcbiAgICAgICAgdGhpcy5tZXRhS2V5ICAgPSBldmVudC5tZXRhS2V5O1xuICAgICAgICB0aGlzLmJ1dHRvbiAgICA9IGV2ZW50LmJ1dHRvbjtcbiAgICAgICAgdGhpcy50YXJnZXQgICAgPSBlbGVtZW50O1xuICAgICAgICB0aGlzLnQwICAgICAgICA9IGludGVyYWN0aW9uLmRvd25UaW1lc1swXTtcbiAgICAgICAgdGhpcy50eXBlICAgICAgPSBhY3Rpb24gKyAocGhhc2UgfHwgJycpO1xuXG4gICAgICAgIHRoaXMuaW50ZXJhY3Rpb24gPSBpbnRlcmFjdGlvbjtcbiAgICAgICAgdGhpcy5pbnRlcmFjdGFibGUgPSB0YXJnZXQ7XG5cbiAgICAgICAgdmFyIGluZXJ0aWFTdGF0dXMgPSBpbnRlcmFjdGlvbi5pbmVydGlhU3RhdHVzO1xuXG4gICAgICAgIGlmIChpbmVydGlhU3RhdHVzLmFjdGl2ZSkge1xuICAgICAgICAgICAgdGhpcy5kZXRhaWwgPSAnaW5lcnRpYSc7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocmVsYXRlZCkge1xuICAgICAgICAgICAgdGhpcy5yZWxhdGVkVGFyZ2V0ID0gcmVsYXRlZDtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGVuZCBldmVudCBkeCwgZHkgaXMgZGlmZmVyZW5jZSBiZXR3ZWVuIHN0YXJ0IGFuZCBlbmQgcG9pbnRzXG4gICAgICAgIGlmIChlbmRpbmcpIHtcbiAgICAgICAgICAgIGlmIChkZWx0YVNvdXJjZSA9PT0gJ2NsaWVudCcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmR4ID0gY2xpZW50LnggLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueDtcbiAgICAgICAgICAgICAgICB0aGlzLmR5ID0gY2xpZW50LnkgLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5jbGllbnQueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZHggPSBwYWdlLnggLSBpbnRlcmFjdGlvbi5zdGFydENvb3Jkcy5wYWdlLng7XG4gICAgICAgICAgICAgICAgdGhpcy5keSA9IHBhZ2UueSAtIGludGVyYWN0aW9uLnN0YXJ0Q29vcmRzLnBhZ2UueTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChzdGFydGluZykge1xuICAgICAgICAgICAgdGhpcy5keCA9IDA7XG4gICAgICAgICAgICB0aGlzLmR5ID0gMDtcbiAgICAgICAgfVxuICAgICAgICAvLyBjb3B5IHByb3BlcnRpZXMgZnJvbSBwcmV2aW91c21vdmUgaWYgc3RhcnRpbmcgaW5lcnRpYVxuICAgICAgICBlbHNlIGlmIChwaGFzZSA9PT0gJ2luZXJ0aWFzdGFydCcpIHtcbiAgICAgICAgICAgIHRoaXMuZHggPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZHg7XG4gICAgICAgICAgICB0aGlzLmR5ID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LmR5O1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgaWYgKGRlbHRhU291cmNlID09PSAnY2xpZW50Jykge1xuICAgICAgICAgICAgICAgIHRoaXMuZHggPSBjbGllbnQueCAtIGludGVyYWN0aW9uLnByZXZFdmVudC5jbGllbnRYO1xuICAgICAgICAgICAgICAgIHRoaXMuZHkgPSBjbGllbnQueSAtIGludGVyYWN0aW9uLnByZXZFdmVudC5jbGllbnRZO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5keCA9IHBhZ2UueCAtIGludGVyYWN0aW9uLnByZXZFdmVudC5wYWdlWDtcbiAgICAgICAgICAgICAgICB0aGlzLmR5ID0gcGFnZS55IC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnBhZ2VZO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnRlcmFjdGlvbi5wcmV2RXZlbnQgJiYgaW50ZXJhY3Rpb24ucHJldkV2ZW50LmRldGFpbCA9PT0gJ2luZXJ0aWEnXG4gICAgICAgICAgICAmJiAhaW5lcnRpYVN0YXR1cy5hY3RpdmVcbiAgICAgICAgICAgICYmIG9wdGlvbnNbYWN0aW9uXS5pbmVydGlhICYmIG9wdGlvbnNbYWN0aW9uXS5pbmVydGlhLnplcm9SZXN1bWVEZWx0YSkge1xuXG4gICAgICAgICAgICBpbmVydGlhU3RhdHVzLnJlc3VtZUR4ICs9IHRoaXMuZHg7XG4gICAgICAgICAgICBpbmVydGlhU3RhdHVzLnJlc3VtZUR5ICs9IHRoaXMuZHk7XG5cbiAgICAgICAgICAgIHRoaXMuZHggPSB0aGlzLmR5ID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24gPT09ICdyZXNpemUnICYmIGludGVyYWN0aW9uLnJlc2l6ZUF4ZXMpIHtcbiAgICAgICAgICAgIGlmIChvcHRpb25zLnJlc2l6ZS5zcXVhcmUpIHtcbiAgICAgICAgICAgICAgICBpZiAoaW50ZXJhY3Rpb24ucmVzaXplQXhlcyA9PT0gJ3knKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHggPSB0aGlzLmR5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5keSA9IHRoaXMuZHg7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMuYXhlcyA9ICd4eSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLmF4ZXMgPSBpbnRlcmFjdGlvbi5yZXNpemVBeGVzO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLnJlc2l6ZUF4ZXMgPT09ICd4Jykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLmR5ID0gMDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoaW50ZXJhY3Rpb24ucmVzaXplQXhlcyA9PT0gJ3knKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuZHggPSAwO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChhY3Rpb24gPT09ICdnZXN0dXJlJykge1xuICAgICAgICAgICAgdGhpcy50b3VjaGVzID0gW3BvaW50ZXJzWzBdLCBwb2ludGVyc1sxXV07XG5cbiAgICAgICAgICAgIGlmIChzdGFydGluZykge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSB0b3VjaERpc3RhbmNlKHBvaW50ZXJzLCBkZWx0YVNvdXJjZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IHRvdWNoQkJveChwb2ludGVycyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IDE7XG4gICAgICAgICAgICAgICAgdGhpcy5kcyAgICAgICA9IDA7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IHRvdWNoQW5nbGUocG9pbnRlcnMsIHVuZGVmaW5lZCwgZGVsdGFTb3VyY2UpO1xuICAgICAgICAgICAgICAgIHRoaXMuZGEgICAgICAgPSAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoZW5kaW5nIHx8IGV2ZW50IGluc3RhbmNlb2YgSW50ZXJhY3RFdmVudCkge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZGlzdGFuY2U7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5ib3g7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5zY2FsZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRzICAgICAgID0gdGhpcy5zY2FsZSAtIDE7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5hbmdsZTtcbiAgICAgICAgICAgICAgICB0aGlzLmRhICAgICAgID0gdGhpcy5hbmdsZSAtIGludGVyYWN0aW9uLmdlc3R1cmUuc3RhcnRBbmdsZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuZGlzdGFuY2UgPSB0b3VjaERpc3RhbmNlKHBvaW50ZXJzLCBkZWx0YVNvdXJjZSk7XG4gICAgICAgICAgICAgICAgdGhpcy5ib3ggICAgICA9IHRvdWNoQkJveChwb2ludGVycyk7XG4gICAgICAgICAgICAgICAgdGhpcy5zY2FsZSAgICA9IHRoaXMuZGlzdGFuY2UgLyBpbnRlcmFjdGlvbi5nZXN0dXJlLnN0YXJ0RGlzdGFuY2U7XG4gICAgICAgICAgICAgICAgdGhpcy5hbmdsZSAgICA9IHRvdWNoQW5nbGUocG9pbnRlcnMsIGludGVyYWN0aW9uLmdlc3R1cmUucHJldkFuZ2xlLCBkZWx0YVNvdXJjZSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmRzID0gdGhpcy5zY2FsZSAtIGludGVyYWN0aW9uLmdlc3R1cmUucHJldlNjYWxlO1xuICAgICAgICAgICAgICAgIHRoaXMuZGEgPSB0aGlzLmFuZ2xlIC0gaW50ZXJhY3Rpb24uZ2VzdHVyZS5wcmV2QW5nbGU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc3RhcnRpbmcpIHtcbiAgICAgICAgICAgIHRoaXMudGltZVN0YW1wID0gaW50ZXJhY3Rpb24uZG93blRpbWVzWzBdO1xuICAgICAgICAgICAgdGhpcy5kdCAgICAgICAgPSAwO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiAgPSAwO1xuICAgICAgICAgICAgdGhpcy5zcGVlZCAgICAgPSAwO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSAwO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSAwO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHBoYXNlID09PSAnaW5lcnRpYXN0YXJ0Jykge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudGltZVN0YW1wO1xuICAgICAgICAgICAgdGhpcy5kdCAgICAgICAgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQuZHQ7XG4gICAgICAgICAgICB0aGlzLmR1cmF0aW9uICA9IGludGVyYWN0aW9uLnByZXZFdmVudC5kdXJhdGlvbjtcbiAgICAgICAgICAgIHRoaXMuc3BlZWQgICAgID0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNwZWVkO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlYO1xuICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlZO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdGhpcy50aW1lU3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgICAgICAgICAgIHRoaXMuZHQgICAgICAgID0gdGhpcy50aW1lU3RhbXAgLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudGltZVN0YW1wO1xuICAgICAgICAgICAgdGhpcy5kdXJhdGlvbiAgPSB0aGlzLnRpbWVTdGFtcCAtIGludGVyYWN0aW9uLmRvd25UaW1lc1swXTtcblxuICAgICAgICAgICAgaWYgKGV2ZW50IGluc3RhbmNlb2YgSW50ZXJhY3RFdmVudCkge1xuICAgICAgICAgICAgICAgIHZhciBkeCA9IHRoaXNbc291cmNlWF0gLSBpbnRlcmFjdGlvbi5wcmV2RXZlbnRbc291cmNlWF0sXG4gICAgICAgICAgICAgICAgICAgIGR5ID0gdGhpc1tzb3VyY2VZXSAtIGludGVyYWN0aW9uLnByZXZFdmVudFtzb3VyY2VZXSxcbiAgICAgICAgICAgICAgICAgICAgZHQgPSB0aGlzLmR0IC8gMTAwMDtcblxuICAgICAgICAgICAgICAgIHRoaXMuc3BlZWQgPSBoeXBvdChkeCwgZHkpIC8gZHQ7XG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVggPSBkeCAvIGR0O1xuICAgICAgICAgICAgICAgIHRoaXMudmVsb2NpdHlZID0gZHkgLyBkdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGlmIG5vcm1hbCBtb3ZlIG9yIGVuZCBldmVudCwgdXNlIHByZXZpb3VzIHVzZXIgZXZlbnQgY29vcmRzXG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBzcGVlZCBhbmQgdmVsb2NpdHkgaW4gcGl4ZWxzIHBlciBzZWNvbmRcbiAgICAgICAgICAgICAgICB0aGlzLnNwZWVkID0gaW50ZXJhY3Rpb24ucG9pbnRlckRlbHRhW2RlbHRhU291cmNlXS5zcGVlZDtcbiAgICAgICAgICAgICAgICB0aGlzLnZlbG9jaXR5WCA9IGludGVyYWN0aW9uLnBvaW50ZXJEZWx0YVtkZWx0YVNvdXJjZV0udng7XG4gICAgICAgICAgICAgICAgdGhpcy52ZWxvY2l0eVkgPSBpbnRlcmFjdGlvbi5wb2ludGVyRGVsdGFbZGVsdGFTb3VyY2VdLnZ5O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKChlbmRpbmcgfHwgcGhhc2UgPT09ICdpbmVydGlhc3RhcnQnKVxuICAgICAgICAgICAgJiYgaW50ZXJhY3Rpb24ucHJldkV2ZW50LnNwZWVkID4gNjAwICYmIHRoaXMudGltZVN0YW1wIC0gaW50ZXJhY3Rpb24ucHJldkV2ZW50LnRpbWVTdGFtcCA8IDE1MCkge1xuXG4gICAgICAgICAgICB2YXIgYW5nbGUgPSAxODAgKiBNYXRoLmF0YW4yKGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVksIGludGVyYWN0aW9uLnByZXZFdmVudC52ZWxvY2l0eVgpIC8gTWF0aC5QSSxcbiAgICAgICAgICAgICAgICBvdmVybGFwID0gMjIuNTtcblxuICAgICAgICAgICAgaWYgKGFuZ2xlIDwgMCkge1xuICAgICAgICAgICAgICAgIGFuZ2xlICs9IDM2MDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGxlZnQgPSAxMzUgLSBvdmVybGFwIDw9IGFuZ2xlICYmIGFuZ2xlIDwgMjI1ICsgb3ZlcmxhcCxcbiAgICAgICAgICAgICAgICB1cCAgID0gMjI1IC0gb3ZlcmxhcCA8PSBhbmdsZSAmJiBhbmdsZSA8IDMxNSArIG92ZXJsYXAsXG5cbiAgICAgICAgICAgICAgICByaWdodCA9ICFsZWZ0ICYmICgzMTUgLSBvdmVybGFwIDw9IGFuZ2xlIHx8IGFuZ2xlIDwgIDQ1ICsgb3ZlcmxhcCksXG4gICAgICAgICAgICAgICAgZG93biAgPSAhdXAgICAmJiAgIDQ1IC0gb3ZlcmxhcCA8PSBhbmdsZSAmJiBhbmdsZSA8IDEzNSArIG92ZXJsYXA7XG5cbiAgICAgICAgICAgIHRoaXMuc3dpcGUgPSB7XG4gICAgICAgICAgICAgICAgdXAgICA6IHVwLFxuICAgICAgICAgICAgICAgIGRvd24gOiBkb3duLFxuICAgICAgICAgICAgICAgIGxlZnQgOiBsZWZ0LFxuICAgICAgICAgICAgICAgIHJpZ2h0OiByaWdodCxcbiAgICAgICAgICAgICAgICBhbmdsZTogYW5nbGUsXG4gICAgICAgICAgICAgICAgc3BlZWQ6IGludGVyYWN0aW9uLnByZXZFdmVudC5zcGVlZCxcbiAgICAgICAgICAgICAgICB2ZWxvY2l0eToge1xuICAgICAgICAgICAgICAgICAgICB4OiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlYLFxuICAgICAgICAgICAgICAgICAgICB5OiBpbnRlcmFjdGlvbi5wcmV2RXZlbnQudmVsb2NpdHlZXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIEludGVyYWN0RXZlbnQucHJvdG90eXBlID0ge1xuICAgICAgICBwcmV2ZW50RGVmYXVsdDogYmxhbmssXG4gICAgICAgIHN0b3BJbW1lZGlhdGVQcm9wYWdhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pbW1lZGlhdGVQcm9wYWdhdGlvblN0b3BwZWQgPSB0aGlzLnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3BQcm9wYWdhdGlvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5wcm9wYWdhdGlvblN0b3BwZWQgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHByZXZlbnRPcmlnaW5hbERlZmF1bHQgKCkge1xuICAgICAgICB0aGlzLm9yaWdpbmFsRXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRBY3Rpb25DdXJzb3IgKGFjdGlvbikge1xuICAgICAgICB2YXIgY3Vyc29yID0gJyc7XG5cbiAgICAgICAgaWYgKGFjdGlvbi5uYW1lID09PSAnZHJhZycpIHtcbiAgICAgICAgICAgIGN1cnNvciA9ICBhY3Rpb25DdXJzb3JzLmRyYWc7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGFjdGlvbi5uYW1lID09PSAncmVzaXplJykge1xuICAgICAgICAgICAgaWYgKGFjdGlvbi5heGlzKSB7XG4gICAgICAgICAgICAgICAgY3Vyc29yID0gIGFjdGlvbkN1cnNvcnNbYWN0aW9uLm5hbWUgKyBhY3Rpb24uYXhpc107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChhY3Rpb24uZWRnZXMpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3Vyc29yS2V5ID0gJ3Jlc2l6ZScsXG4gICAgICAgICAgICAgICAgICAgIGVkZ2VOYW1lcyA9IFsndG9wJywgJ2JvdHRvbScsICdsZWZ0JywgJ3JpZ2h0J107XG5cbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IDQ7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWN0aW9uLmVkZ2VzW2VkZ2VOYW1lc1tpXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnNvcktleSArPSBlZGdlTmFtZXNbaV07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBjdXJzb3IgPSBhY3Rpb25DdXJzb3JzW2N1cnNvcktleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gY3Vyc29yO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoZWNrUmVzaXplRWRnZSAobmFtZSwgdmFsdWUsIHBhZ2UsIGVsZW1lbnQsIGludGVyYWN0YWJsZUVsZW1lbnQsIHJlY3QpIHtcbiAgICAgICAgLy8gZmFsc2UsICcnLCB1bmRlZmluZWQsIG51bGxcbiAgICAgICAgaWYgKCF2YWx1ZSkgeyByZXR1cm4gZmFsc2U7IH1cblxuICAgICAgICAvLyB0cnVlIHZhbHVlLCB1c2UgcG9pbnRlciBjb29yZHMgYW5kIGVsZW1lbnQgcmVjdFxuICAgICAgICBpZiAodmFsdWUgPT09IHRydWUpIHtcbiAgICAgICAgICAgIC8vIGlmIGRpbWVuc2lvbnMgYXJlIG5lZ2F0aXZlLCBcInN3aXRjaFwiIGVkZ2VzXG4gICAgICAgICAgICB2YXIgd2lkdGggPSBpc051bWJlcihyZWN0LndpZHRoKT8gcmVjdC53aWR0aCA6IHJlY3QucmlnaHQgLSByZWN0LmxlZnQsXG4gICAgICAgICAgICAgICAgaGVpZ2h0ID0gaXNOdW1iZXIocmVjdC5oZWlnaHQpPyByZWN0LmhlaWdodCA6IHJlY3QuYm90dG9tIC0gcmVjdC50b3A7XG5cbiAgICAgICAgICAgIGlmICh3aWR0aCA8IDApIHtcbiAgICAgICAgICAgICAgICBpZiAgICAgIChuYW1lID09PSAnbGVmdCcgKSB7IG5hbWUgPSAncmlnaHQnOyB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAobmFtZSA9PT0gJ3JpZ2h0JykgeyBuYW1lID0gJ2xlZnQnIDsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGhlaWdodCA8IDApIHtcbiAgICAgICAgICAgICAgICBpZiAgICAgIChuYW1lID09PSAndG9wJyAgICkgeyBuYW1lID0gJ2JvdHRvbSc7IH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChuYW1lID09PSAnYm90dG9tJykgeyBuYW1lID0gJ3RvcCcgICA7IH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5hbWUgPT09ICdsZWZ0JyAgKSB7IHJldHVybiBwYWdlLnggPCAoKHdpZHRoICA+PSAwPyByZWN0LmxlZnQ6IHJlY3QucmlnaHQgKSArIG1hcmdpbik7IH1cbiAgICAgICAgICAgIGlmIChuYW1lID09PSAndG9wJyAgICkgeyByZXR1cm4gcGFnZS55IDwgKChoZWlnaHQgPj0gMD8gcmVjdC50b3AgOiByZWN0LmJvdHRvbSkgKyBtYXJnaW4pOyB9XG5cbiAgICAgICAgICAgIGlmIChuYW1lID09PSAncmlnaHQnICkgeyByZXR1cm4gcGFnZS54ID4gKCh3aWR0aCAgPj0gMD8gcmVjdC5yaWdodCA6IHJlY3QubGVmdCkgLSBtYXJnaW4pOyB9XG4gICAgICAgICAgICBpZiAobmFtZSA9PT0gJ2JvdHRvbScpIHsgcmV0dXJuIHBhZ2UueSA+ICgoaGVpZ2h0ID49IDA/IHJlY3QuYm90dG9tOiByZWN0LnRvcCApIC0gbWFyZ2luKTsgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhlIHJlbWFpbmluZyBjaGVja3MgcmVxdWlyZSBhbiBlbGVtZW50XG4gICAgICAgIGlmICghaXNFbGVtZW50KGVsZW1lbnQpKSB7IHJldHVybiBmYWxzZTsgfVxuXG4gICAgICAgIHJldHVybiBpc0VsZW1lbnQodmFsdWUpXG4gICAgICAgICAgICAgICAgICAgIC8vIHRoZSB2YWx1ZSBpcyBhbiBlbGVtZW50IHRvIHVzZSBhcyBhIHJlc2l6ZSBoYW5kbGVcbiAgICAgICAgICAgICAgICAgICAgPyB2YWx1ZSA9PT0gZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICAvLyBvdGhlcndpc2UgY2hlY2sgaWYgZWxlbWVudCBtYXRjaGVzIHZhbHVlIGFzIHNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgIDogbWF0Y2hlc1VwVG8oZWxlbWVudCwgdmFsdWUsIGludGVyYWN0YWJsZUVsZW1lbnQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGRlZmF1bHRBY3Rpb25DaGVja2VyIChwb2ludGVyLCBpbnRlcmFjdGlvbiwgZWxlbWVudCkge1xuICAgICAgICB2YXIgcmVjdCA9IHRoaXMuZ2V0UmVjdChlbGVtZW50KSxcbiAgICAgICAgICAgIHNob3VsZFJlc2l6ZSA9IGZhbHNlLFxuICAgICAgICAgICAgYWN0aW9uID0gbnVsbCxcbiAgICAgICAgICAgIHJlc2l6ZUF4ZXMgPSBudWxsLFxuICAgICAgICAgICAgcmVzaXplRWRnZXMsXG4gICAgICAgICAgICBwYWdlID0gZXh0ZW5kKHt9LCBpbnRlcmFjdGlvbi5jdXJDb29yZHMucGFnZSksXG4gICAgICAgICAgICBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuXG4gICAgICAgIGlmICghcmVjdCkgeyByZXR1cm4gbnVsbDsgfVxuXG4gICAgICAgIGlmIChhY3Rpb25Jc0VuYWJsZWQucmVzaXplICYmIG9wdGlvbnMucmVzaXplLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIHZhciByZXNpemVPcHRpb25zID0gb3B0aW9ucy5yZXNpemU7XG5cbiAgICAgICAgICAgIHJlc2l6ZUVkZ2VzID0ge1xuICAgICAgICAgICAgICAgIGxlZnQ6IGZhbHNlLCByaWdodDogZmFsc2UsIHRvcDogZmFsc2UsIGJvdHRvbTogZmFsc2VcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIGlmIHVzaW5nIHJlc2l6ZS5lZGdlc1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KHJlc2l6ZU9wdGlvbnMuZWRnZXMpKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgZWRnZSBpbiByZXNpemVFZGdlcykge1xuICAgICAgICAgICAgICAgICAgICByZXNpemVFZGdlc1tlZGdlXSA9IGNoZWNrUmVzaXplRWRnZShlZGdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNpemVPcHRpb25zLmVkZ2VzW2VkZ2VdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5fZXZlbnRUYXJnZXQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY3QpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJlc2l6ZUVkZ2VzLmxlZnQgPSByZXNpemVFZGdlcy5sZWZ0ICYmICFyZXNpemVFZGdlcy5yaWdodDtcbiAgICAgICAgICAgICAgICByZXNpemVFZGdlcy50b3AgID0gcmVzaXplRWRnZXMudG9wICAmJiAhcmVzaXplRWRnZXMuYm90dG9tO1xuXG4gICAgICAgICAgICAgICAgc2hvdWxkUmVzaXplID0gcmVzaXplRWRnZXMubGVmdCB8fCByZXNpemVFZGdlcy5yaWdodCB8fCByZXNpemVFZGdlcy50b3AgfHwgcmVzaXplRWRnZXMuYm90dG9tO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHJpZ2h0ICA9IG9wdGlvbnMucmVzaXplLmF4aXMgIT09ICd5JyAmJiBwYWdlLnggPiAocmVjdC5yaWdodCAgLSBtYXJnaW4pLFxuICAgICAgICAgICAgICAgICAgICBib3R0b20gPSBvcHRpb25zLnJlc2l6ZS5heGlzICE9PSAneCcgJiYgcGFnZS55ID4gKHJlY3QuYm90dG9tIC0gbWFyZ2luKTtcblxuICAgICAgICAgICAgICAgIHNob3VsZFJlc2l6ZSA9IHJpZ2h0IHx8IGJvdHRvbTtcbiAgICAgICAgICAgICAgICByZXNpemVBeGVzID0gKHJpZ2h0PyAneCcgOiAnJykgKyAoYm90dG9tPyAneScgOiAnJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBhY3Rpb24gPSBzaG91bGRSZXNpemVcbiAgICAgICAgICAgID8gJ3Jlc2l6ZSdcbiAgICAgICAgICAgIDogYWN0aW9uSXNFbmFibGVkLmRyYWcgJiYgb3B0aW9ucy5kcmFnLmVuYWJsZWRcbiAgICAgICAgICAgICAgICA/ICdkcmFnJ1xuICAgICAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICBpZiAoYWN0aW9uSXNFbmFibGVkLmdlc3R1cmVcbiAgICAgICAgICAgICYmIGludGVyYWN0aW9uLnBvaW50ZXJJZHMubGVuZ3RoID49MlxuICAgICAgICAgICAgJiYgIShpbnRlcmFjdGlvbi5kcmFnZ2luZyB8fCBpbnRlcmFjdGlvbi5yZXNpemluZykpIHtcbiAgICAgICAgICAgIGFjdGlvbiA9ICdnZXN0dXJlJztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgbmFtZTogYWN0aW9uLFxuICAgICAgICAgICAgICAgIGF4aXM6IHJlc2l6ZUF4ZXMsXG4gICAgICAgICAgICAgICAgZWRnZXM6IHJlc2l6ZUVkZ2VzXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgYWN0aW9uIGlzIGVuYWJsZWQgZ2xvYmFsbHkgYW5kIHRoZSBjdXJyZW50IHRhcmdldCBzdXBwb3J0cyBpdFxuICAgIC8vIElmIHNvLCByZXR1cm4gdGhlIHZhbGlkYXRlZCBhY3Rpb24uIE90aGVyd2lzZSwgcmV0dXJuIG51bGxcbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUFjdGlvbiAoYWN0aW9uLCBpbnRlcmFjdGFibGUpIHtcbiAgICAgICAgaWYgKCFpc09iamVjdChhY3Rpb24pKSB7IHJldHVybiBudWxsOyB9XG5cbiAgICAgICAgdmFyIGFjdGlvbk5hbWUgPSBhY3Rpb24ubmFtZSxcbiAgICAgICAgICAgIG9wdGlvbnMgPSBpbnRlcmFjdGFibGUub3B0aW9ucztcblxuICAgICAgICBpZiAoKCAgKGFjdGlvbk5hbWUgID09PSAncmVzaXplJyAgICYmIG9wdGlvbnMucmVzaXplLmVuYWJsZWQgKVxuICAgICAgICAgICAgfHwgKGFjdGlvbk5hbWUgICAgICA9PT0gJ2RyYWcnICAgICAmJiBvcHRpb25zLmRyYWcuZW5hYmxlZCAgKVxuICAgICAgICAgICAgfHwgKGFjdGlvbk5hbWUgICAgICA9PT0gJ2dlc3R1cmUnICAmJiBvcHRpb25zLmdlc3R1cmUuZW5hYmxlZCkpXG4gICAgICAgICAgICAmJiBhY3Rpb25Jc0VuYWJsZWRbYWN0aW9uTmFtZV0pIHtcblxuICAgICAgICAgICAgaWYgKGFjdGlvbk5hbWUgPT09ICdyZXNpemUnIHx8IGFjdGlvbk5hbWUgPT09ICdyZXNpemV5eCcpIHtcbiAgICAgICAgICAgICAgICBhY3Rpb25OYW1lID0gJ3Jlc2l6ZXh5JztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICB2YXIgbGlzdGVuZXJzID0ge30sXG4gICAgICAgIGludGVyYWN0aW9uTGlzdGVuZXJzID0gW1xuICAgICAgICAgICAgJ2RyYWdTdGFydCcsICdkcmFnTW92ZScsICdyZXNpemVTdGFydCcsICdyZXNpemVNb3ZlJywgJ2dlc3R1cmVTdGFydCcsICdnZXN0dXJlTW92ZScsXG4gICAgICAgICAgICAncG9pbnRlck92ZXInLCAncG9pbnRlck91dCcsICdwb2ludGVySG92ZXInLCAnc2VsZWN0b3JEb3duJyxcbiAgICAgICAgICAgICdwb2ludGVyRG93bicsICdwb2ludGVyTW92ZScsICdwb2ludGVyVXAnLCAncG9pbnRlckNhbmNlbCcsICdwb2ludGVyRW5kJyxcbiAgICAgICAgICAgICdhZGRQb2ludGVyJywgJ3JlbW92ZVBvaW50ZXInLCAncmVjb3JkUG9pbnRlcicsXG4gICAgICAgIF07XG5cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gaW50ZXJhY3Rpb25MaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgdmFyIG5hbWUgPSBpbnRlcmFjdGlvbkxpc3RlbmVyc1tpXTtcblxuICAgICAgICBsaXN0ZW5lcnNbbmFtZV0gPSBkb09uSW50ZXJhY3Rpb25zKG5hbWUpO1xuICAgIH1cblxuICAgIC8vIGJvdW5kIHRvIHRoZSBpbnRlcmFjdGFibGUgY29udGV4dCB3aGVuIGEgRE9NIGV2ZW50XG4gICAgLy8gbGlzdGVuZXIgaXMgYWRkZWQgdG8gYSBzZWxlY3RvciBpbnRlcmFjdGFibGVcbiAgICBmdW5jdGlvbiBkZWxlZ2F0ZUxpc3RlbmVyIChldmVudCwgdXNlQ2FwdHVyZSkge1xuICAgICAgICB2YXIgZmFrZUV2ZW50ID0ge30sXG4gICAgICAgICAgICBkZWxlZ2F0ZWQgPSBkZWxlZ2F0ZWRFdmVudHNbZXZlbnQudHlwZV0sXG4gICAgICAgICAgICBldmVudFRhcmdldCA9IGdldEFjdHVhbEVsZW1lbnQoZXZlbnQucGF0aFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZXZlbnQucGF0aFswXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogZXZlbnQudGFyZ2V0KSxcbiAgICAgICAgICAgIGVsZW1lbnQgPSBldmVudFRhcmdldDtcblxuICAgICAgICB1c2VDYXB0dXJlID0gdXNlQ2FwdHVyZT8gdHJ1ZTogZmFsc2U7XG5cbiAgICAgICAgLy8gZHVwbGljYXRlIHRoZSBldmVudCBzbyB0aGF0IGN1cnJlbnRUYXJnZXQgY2FuIGJlIGNoYW5nZWRcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBldmVudCkge1xuICAgICAgICAgICAgZmFrZUV2ZW50W3Byb3BdID0gZXZlbnRbcHJvcF07XG4gICAgICAgIH1cblxuICAgICAgICBmYWtlRXZlbnQub3JpZ2luYWxFdmVudCA9IGV2ZW50O1xuICAgICAgICBmYWtlRXZlbnQucHJldmVudERlZmF1bHQgPSBwcmV2ZW50T3JpZ2luYWxEZWZhdWx0O1xuXG4gICAgICAgIC8vIGNsaW1iIHVwIGRvY3VtZW50IHRyZWUgbG9va2luZyBmb3Igc2VsZWN0b3IgbWF0Y2hlc1xuICAgICAgICB3aGlsZSAoaXNFbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgc2VsZWN0b3IgPSBkZWxlZ2F0ZWQuc2VsZWN0b3JzW2ldLFxuICAgICAgICAgICAgICAgICAgICBjb250ZXh0ID0gZGVsZWdhdGVkLmNvbnRleHRzW2ldO1xuXG4gICAgICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvcilcbiAgICAgICAgICAgICAgICAgICAgJiYgbm9kZUNvbnRhaW5zKGNvbnRleHQsIGV2ZW50VGFyZ2V0KVxuICAgICAgICAgICAgICAgICAgICAmJiBub2RlQ29udGFpbnMoY29udGV4dCwgZWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGVsZWdhdGVkLmxpc3RlbmVyc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBmYWtlRXZlbnQuY3VycmVudFRhcmdldCA9IGVsZW1lbnQ7XG5cbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsaXN0ZW5lcnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChsaXN0ZW5lcnNbal1bMV0gPT09IHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBsaXN0ZW5lcnNbal1bMF0oZmFrZUV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBkZWxlZ2F0ZVVzZUNhcHR1cmUgKGV2ZW50KSB7XG4gICAgICAgIHJldHVybiBkZWxlZ2F0ZUxpc3RlbmVyLmNhbGwodGhpcywgZXZlbnQsIHRydWUpO1xuICAgIH1cblxuICAgIGludGVyYWN0YWJsZXMuaW5kZXhPZkVsZW1lbnQgPSBmdW5jdGlvbiBpbmRleE9mRWxlbWVudCAoZWxlbWVudCwgY29udGV4dCkge1xuICAgICAgICBjb250ZXh0ID0gY29udGV4dCB8fCBkb2N1bWVudDtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSB0aGlzW2ldO1xuXG4gICAgICAgICAgICBpZiAoKGludGVyYWN0YWJsZS5zZWxlY3RvciA9PT0gZWxlbWVudFxuICAgICAgICAgICAgICAgICYmIChpbnRlcmFjdGFibGUuX2NvbnRleHQgPT09IGNvbnRleHQpKVxuICAgICAgICAgICAgICAgIHx8ICghaW50ZXJhY3RhYmxlLnNlbGVjdG9yICYmIGludGVyYWN0YWJsZS5fZWxlbWVudCA9PT0gZWxlbWVudCkpIHtcblxuICAgICAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuXG4gICAgaW50ZXJhY3RhYmxlcy5nZXQgPSBmdW5jdGlvbiBpbnRlcmFjdGFibGVHZXQgKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbdGhpcy5pbmRleE9mRWxlbWVudChlbGVtZW50LCBvcHRpb25zICYmIG9wdGlvbnMuY29udGV4dCldO1xuICAgIH07XG5cbiAgICBpbnRlcmFjdGFibGVzLmZvckVhY2hTZWxlY3RvciA9IGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBpbnRlcmFjdGFibGUgPSB0aGlzW2ldO1xuXG4gICAgICAgICAgICBpZiAoIWludGVyYWN0YWJsZS5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgcmV0ID0gY2FsbGJhY2soaW50ZXJhY3RhYmxlLCBpbnRlcmFjdGFibGUuc2VsZWN0b3IsIGludGVyYWN0YWJsZS5fY29udGV4dCwgaSwgdGhpcyk7XG5cbiAgICAgICAgICAgIGlmIChyZXQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0XG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIFRoZSBtZXRob2RzIG9mIHRoaXMgdmFyaWFibGUgY2FuIGJlIHVzZWQgdG8gc2V0IGVsZW1lbnRzIGFzXG4gICAgICogaW50ZXJhY3RhYmxlcyBhbmQgYWxzbyB0byBjaGFuZ2UgdmFyaW91cyBkZWZhdWx0IHNldHRpbmdzLlxuICAgICAqXG4gICAgICogQ2FsbGluZyBpdCBhcyBhIGZ1bmN0aW9uIGFuZCBwYXNzaW5nIGFuIGVsZW1lbnQgb3IgYSB2YWxpZCBDU1Mgc2VsZWN0b3JcbiAgICAgKiBzdHJpbmcgcmV0dXJucyBhbiBJbnRlcmFjdGFibGUgb2JqZWN0IHdoaWNoIGhhcyB2YXJpb3VzIG1ldGhvZHMgdG9cbiAgICAgKiBjb25maWd1cmUgaXQuXG4gICAgICpcbiAgICAgLSBlbGVtZW50IChFbGVtZW50IHwgc3RyaW5nKSBUaGUgSFRNTCBvciBTVkcgRWxlbWVudCB0byBpbnRlcmFjdCB3aXRoIG9yIENTUyBzZWxlY3RvclxuICAgICA9IChvYmplY3QpIEFuIEBJbnRlcmFjdGFibGVcbiAgICAgKlxuICAgICA+IFVzYWdlXG4gICAgIHwgaW50ZXJhY3QoZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2RyYWdnYWJsZScpKS5kcmFnZ2FibGUodHJ1ZSk7XG4gICAgIHxcbiAgICAgfCB2YXIgcmVjdGFibGVzID0gaW50ZXJhY3QoJ3JlY3QnKTtcbiAgICAgfCByZWN0YWJsZXNcbiAgICAgfCAgICAgLmdlc3R1cmFibGUodHJ1ZSlcbiAgICAgfCAgICAgLm9uKCdnZXN0dXJlbW92ZScsIGZ1bmN0aW9uIChldmVudCkge1xuICAgICB8ICAgICAgICAgLy8gc29tZXRoaW5nIGNvb2wuLi5cbiAgICAgfCAgICAgfSlcbiAgICAgfCAgICAgLmF1dG9TY3JvbGwodHJ1ZSk7XG4gICAgXFwqL1xuICAgIGZ1bmN0aW9uIGludGVyYWN0IChlbGVtZW50LCBvcHRpb25zKSB7XG4gICAgICAgIHJldHVybiBpbnRlcmFjdGFibGVzLmdldChlbGVtZW50LCBvcHRpb25zKSB8fCBuZXcgSW50ZXJhY3RhYmxlKGVsZW1lbnQsIG9wdGlvbnMpO1xuICAgIH1cblxuICAgIC8qXFxcbiAgICAgKiBJbnRlcmFjdGFibGVcbiAgICAgWyBwcm9wZXJ0eSBdXG4gICAgICoqXG4gICAgICogT2JqZWN0IHR5cGUgcmV0dXJuZWQgYnkgQGludGVyYWN0XG4gICAgXFwqL1xuICAgIGZ1bmN0aW9uIEludGVyYWN0YWJsZSAoZWxlbWVudCwgb3B0aW9ucykge1xuICAgICAgICB0aGlzLl9lbGVtZW50ID0gZWxlbWVudDtcbiAgICAgICAgdGhpcy5faUV2ZW50cyA9IHRoaXMuX2lFdmVudHMgfHwge307XG5cbiAgICAgICAgdmFyIF93aW5kb3c7XG5cbiAgICAgICAgaWYgKHRyeVNlbGVjdG9yKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICB0aGlzLnNlbGVjdG9yID0gZWxlbWVudDtcblxuICAgICAgICAgICAgdmFyIGNvbnRleHQgPSBvcHRpb25zICYmIG9wdGlvbnMuY29udGV4dDtcblxuICAgICAgICAgICAgX3dpbmRvdyA9IGNvbnRleHQ/IGdldFdpbmRvdyhjb250ZXh0KSA6IHdpbmRvdztcblxuICAgICAgICAgICAgaWYgKGNvbnRleHQgJiYgKF93aW5kb3cuTm9kZVxuICAgICAgICAgICAgICAgICAgICA/IGNvbnRleHQgaW5zdGFuY2VvZiBfd2luZG93Lk5vZGVcbiAgICAgICAgICAgICAgICAgICAgOiAoaXNFbGVtZW50KGNvbnRleHQpIHx8IGNvbnRleHQgPT09IF93aW5kb3cuZG9jdW1lbnQpKSkge1xuXG4gICAgICAgICAgICAgICAgdGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBfd2luZG93ID0gZ2V0V2luZG93KGVsZW1lbnQpO1xuXG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KGVsZW1lbnQsIF93aW5kb3cpKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAoUG9pbnRlckV2ZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgcEV2ZW50VHlwZXMuZG93biwgbGlzdGVuZXJzLnBvaW50ZXJEb3duICk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgcEV2ZW50VHlwZXMubW92ZSwgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuX2VsZW1lbnQsICdtb3VzZWRvd24nICwgbGlzdGVuZXJzLnBvaW50ZXJEb3duICk7XG4gICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgJ21vdXNlbW92ZScgLCBsaXN0ZW5lcnMucG9pbnRlckhvdmVyKTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZCh0aGlzLl9lbGVtZW50LCAndG91Y2hzdGFydCcsIGxpc3RlbmVycy5wb2ludGVyRG93biApO1xuICAgICAgICAgICAgICAgICAgICBldmVudHMuYWRkKHRoaXMuX2VsZW1lbnQsICd0b3VjaG1vdmUnICwgbGlzdGVuZXJzLnBvaW50ZXJIb3Zlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fZG9jID0gX3dpbmRvdy5kb2N1bWVudDtcblxuICAgICAgICBpZiAoIWNvbnRhaW5zKGRvY3VtZW50cywgdGhpcy5fZG9jKSkge1xuICAgICAgICAgICAgbGlzdGVuVG9Eb2N1bWVudCh0aGlzLl9kb2MpO1xuICAgICAgICB9XG5cbiAgICAgICAgaW50ZXJhY3RhYmxlcy5wdXNoKHRoaXMpO1xuXG4gICAgICAgIHRoaXMuc2V0KG9wdGlvbnMpO1xuICAgIH1cblxuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUgPSB7XG4gICAgICAgIHNldE9uRXZlbnRzOiBmdW5jdGlvbiAoYWN0aW9uLCBwaGFzZXMpIHtcbiAgICAgICAgICAgIGlmIChhY3Rpb24gPT09ICdkcm9wJykge1xuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3ApICAgICAgICAgICkgeyB0aGlzLm9uZHJvcCAgICAgICAgICAgPSBwaGFzZXMub25kcm9wICAgICAgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3BhY3RpdmF0ZSkgICkgeyB0aGlzLm9uZHJvcGFjdGl2YXRlICAgPSBwaGFzZXMub25kcm9wYWN0aXZhdGUgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3BkZWFjdGl2YXRlKSkgeyB0aGlzLm9uZHJvcGRlYWN0aXZhdGUgPSBwaGFzZXMub25kcm9wZGVhY3RpdmF0ZTsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyYWdlbnRlcikgICAgICkgeyB0aGlzLm9uZHJhZ2VudGVyICAgICAgPSBwaGFzZXMub25kcmFnZW50ZXIgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyYWdsZWF2ZSkgICAgICkgeyB0aGlzLm9uZHJhZ2xlYXZlICAgICAgPSBwaGFzZXMub25kcmFnbGVhdmUgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmRyb3Btb3ZlKSAgICAgICkgeyB0aGlzLm9uZHJvcG1vdmUgICAgICAgPSBwaGFzZXMub25kcm9wbW92ZSAgICAgIDsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYWN0aW9uID0gJ29uJyArIGFjdGlvbjtcblxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbnN0YXJ0KSAgICAgICApIHsgdGhpc1thY3Rpb24gKyAnc3RhcnQnICAgICAgICAgXSA9IHBoYXNlcy5vbnN0YXJ0ICAgICAgICAgOyB9XG4gICAgICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24ocGhhc2VzLm9ubW92ZSkgICAgICAgICkgeyB0aGlzW2FjdGlvbiArICdtb3ZlJyAgICAgICAgICBdID0gcGhhc2VzLm9ubW92ZSAgICAgICAgICA7IH1cbiAgICAgICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihwaGFzZXMub25lbmQpICAgICAgICAgKSB7IHRoaXNbYWN0aW9uICsgJ2VuZCcgICAgICAgICAgIF0gPSBwaGFzZXMub25lbmQgICAgICAgICAgIDsgfVxuICAgICAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHBoYXNlcy5vbmluZXJ0aWFzdGFydCkpIHsgdGhpc1thY3Rpb24gKyAnaW5lcnRpYXN0YXJ0JyAgXSA9IHBoYXNlcy5vbmluZXJ0aWFzdGFydCAgOyB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRyYWdnYWJsZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciBkcmFnIGFjdGlvbnMgY2FuIGJlIHBlcmZvcm1lZCBvbiB0aGVcbiAgICAgICAgICogSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICA9IChib29sZWFuKSBJbmRpY2F0ZXMgaWYgdGhpcyBjYW4gYmUgdGhlIHRhcmdldCBvZiBkcmFnIGV2ZW50c1xuICAgICAgICAgfCB2YXIgaXNEcmFnZ2FibGUgPSBpbnRlcmFjdCgndWwgbGknKS5kcmFnZ2FibGUoKTtcbiAgICAgICAgICogb3JcbiAgICAgICAgIC0gb3B0aW9ucyAoYm9vbGVhbiB8IG9iamVjdCkgI29wdGlvbmFsIHRydWUvZmFsc2Ugb3IgQW4gb2JqZWN0IHdpdGggZXZlbnQgbGlzdGVuZXJzIHRvIGJlIGZpcmVkIG9uIGRyYWcgZXZlbnRzIChvYmplY3QgbWFrZXMgdGhlIEludGVyYWN0YWJsZSBkcmFnZ2FibGUpXG4gICAgICAgICA9IChvYmplY3QpIFRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmRyYWdnYWJsZSh7XG4gICAgICAgICB8ICAgICBvbnN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25tb3ZlIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9uZW5kICA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyB0aGUgYXhpcyBpbiB3aGljaCB0aGUgZmlyc3QgbW92ZW1lbnQgbXVzdCBiZVxuICAgICAgICAgfCAgICAgLy8gZm9yIHRoZSBkcmFnIHNlcXVlbmNlIHRvIHN0YXJ0XG4gICAgICAgICB8ICAgICAvLyAneHknIGJ5IGRlZmF1bHQgLSBhbnkgZGlyZWN0aW9uXG4gICAgICAgICB8ICAgICBheGlzOiAneCcgfHwgJ3knIHx8ICd4eScsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBtYXggbnVtYmVyIG9mIGRyYWdzIHRoYXQgY2FuIGhhcHBlbiBjb25jdXJyZW50bHlcbiAgICAgICAgIHwgICAgIC8vIHdpdGggZWxlbWVudHMgb2YgdGhpcyBJbnRlcmFjdGFibGUuIEluZmluaXR5IGJ5IGRlZmF1bHRcbiAgICAgICAgIHwgICAgIG1heDogSW5maW5pdHksXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBtYXggbnVtYmVyIG9mIGRyYWdzIHRoYXQgY2FuIHRhcmdldCB0aGUgc2FtZSBlbGVtZW50K0ludGVyYWN0YWJsZVxuICAgICAgICAgfCAgICAgLy8gMSBieSBkZWZhdWx0XG4gICAgICAgICB8ICAgICBtYXhQZXJFbGVtZW50OiAyXG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIGRyYWdnYWJsZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcmFnLmVuYWJsZWQgPSBvcHRpb25zLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZTogdHJ1ZTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldFBlckFjdGlvbignZHJhZycsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0T25FdmVudHMoJ2RyYWcnLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIGlmICgvXngkfF55JHxeeHkkLy50ZXN0KG9wdGlvbnMuYXhpcykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyYWcuYXhpcyA9IG9wdGlvbnMuYXhpcztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9ucy5heGlzID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuZHJhZy5heGlzO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyYWcuZW5hYmxlZCA9IG9wdGlvbnM7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcmFnO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldFBlckFjdGlvbjogZnVuY3Rpb24gKGFjdGlvbiwgb3B0aW9ucykge1xuICAgICAgICAgICAgLy8gZm9yIGFsbCB0aGUgZGVmYXVsdCBwZXItYWN0aW9uIG9wdGlvbnNcbiAgICAgICAgICAgIGZvciAodmFyIG9wdGlvbiBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgLy8gaWYgdGhpcyBvcHRpb24gZXhpc3RzIGZvciB0aGlzIGFjdGlvblxuICAgICAgICAgICAgICAgIGlmIChvcHRpb24gaW4gZGVmYXVsdE9wdGlvbnNbYWN0aW9uXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBpZiB0aGUgb3B0aW9uIGluIHRoZSBvcHRpb25zIGFyZyBpcyBhbiBvYmplY3QgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnNbb3B0aW9uXSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGR1cGxpY2F0ZSB0aGUgb2JqZWN0XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dID0gZXh0ZW5kKHRoaXMub3B0aW9uc1thY3Rpb25dW29wdGlvbl0gfHwge30sIG9wdGlvbnNbb3B0aW9uXSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChpc09iamVjdChkZWZhdWx0T3B0aW9ucy5wZXJBY3Rpb25bb3B0aW9uXSkgJiYgJ2VuYWJsZWQnIGluIGRlZmF1bHRPcHRpb25zLnBlckFjdGlvbltvcHRpb25dKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW2FjdGlvbl1bb3B0aW9uXS5lbmFibGVkID0gb3B0aW9uc1tvcHRpb25dLmVuYWJsZWQgPT09IGZhbHNlPyBmYWxzZSA6IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNCb29sKG9wdGlvbnNbb3B0aW9uXSkgJiYgaXNPYmplY3QoZGVmYXVsdE9wdGlvbnMucGVyQWN0aW9uW29wdGlvbl0pKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dLmVuYWJsZWQgPSBvcHRpb25zW29wdGlvbl07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAob3B0aW9uc1tvcHRpb25dICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG9yIGlmIGl0J3Mgbm90IHVuZGVmaW5lZCwgZG8gYSBwbGFpbiBhc3NpZ25tZW50XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXVtvcHRpb25dID0gb3B0aW9uc1tvcHRpb25dO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRyb3B6b25lXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIGVsZW1lbnRzIGNhbiBiZSBkcm9wcGVkIG9udG8gdGhpc1xuICAgICAgICAgKiBJbnRlcmFjdGFibGUgdG8gdHJpZ2dlciBkcm9wIGV2ZW50c1xuICAgICAgICAgKlxuICAgICAgICAgKiBEcm9wem9uZXMgY2FuIHJlY2VpdmUgdGhlIGZvbGxvd2luZyBldmVudHM6XG4gICAgICAgICAqICAtIGBkcm9wYWN0aXZhdGVgIGFuZCBgZHJvcGRlYWN0aXZhdGVgIHdoZW4gYW4gYWNjZXB0YWJsZSBkcmFnIHN0YXJ0cyBhbmQgZW5kc1xuICAgICAgICAgKiAgLSBgZHJhZ2VudGVyYCBhbmQgYGRyYWdsZWF2ZWAgd2hlbiBhIGRyYWdnYWJsZSBlbnRlcnMgYW5kIGxlYXZlcyB0aGUgZHJvcHpvbmVcbiAgICAgICAgICogIC0gYGRyYWdtb3ZlYCB3aGVuIGEgZHJhZ2dhYmxlIHRoYXQgaGFzIGVudGVyZWQgdGhlIGRyb3B6b25lIGlzIG1vdmVkXG4gICAgICAgICAqICAtIGBkcm9wYCB3aGVuIGEgZHJhZ2dhYmxlIGlzIGRyb3BwZWQgaW50byB0aGlzIGRyb3B6b25lXG4gICAgICAgICAqXG4gICAgICAgICAqICBVc2UgdGhlIGBhY2NlcHRgIG9wdGlvbiB0byBhbGxvdyBvbmx5IGVsZW1lbnRzIHRoYXQgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvciBlbGVtZW50LlxuICAgICAgICAgKlxuICAgICAgICAgKiAgVXNlIHRoZSBgb3ZlcmxhcGAgb3B0aW9uIHRvIHNldCBob3cgZHJvcHMgYXJlIGNoZWNrZWQgZm9yLiBUaGUgYWxsb3dlZCB2YWx1ZXMgYXJlOlxuICAgICAgICAgKiAgIC0gYCdwb2ludGVyJ2AsIHRoZSBwb2ludGVyIG11c3QgYmUgb3ZlciB0aGUgZHJvcHpvbmUgKGRlZmF1bHQpXG4gICAgICAgICAqICAgLSBgJ2NlbnRlcidgLCB0aGUgZHJhZ2dhYmxlIGVsZW1lbnQncyBjZW50ZXIgbXVzdCBiZSBvdmVyIHRoZSBkcm9wem9uZVxuICAgICAgICAgKiAgIC0gYSBudW1iZXIgZnJvbSAwLTEgd2hpY2ggaXMgdGhlIGAoaW50ZXJzZWN0aW9uIGFyZWEpIC8gKGRyYWdnYWJsZSBhcmVhKWAuXG4gICAgICAgICAqICAgICAgIGUuZy4gYDAuNWAgZm9yIGRyb3AgdG8gaGFwcGVuIHdoZW4gaGFsZiBvZiB0aGUgYXJlYSBvZiB0aGVcbiAgICAgICAgICogICAgICAgZHJhZ2dhYmxlIGlzIG92ZXIgdGhlIGRyb3B6b25lXG4gICAgICAgICAqXG4gICAgICAgICAtIG9wdGlvbnMgKGJvb2xlYW4gfCBvYmplY3QgfCBudWxsKSAjb3B0aW9uYWwgVGhlIG5ldyB2YWx1ZSB0byBiZSBzZXQuXG4gICAgICAgICB8IGludGVyYWN0KCcuZHJvcCcpLmRyb3B6b25lKHtcbiAgICAgICAgIHwgICBhY2NlcHQ6ICcuY2FuLWRyb3AnIHx8IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdzaW5nbGUtZHJvcCcpLFxuICAgICAgICAgfCAgIG92ZXJsYXA6ICdwb2ludGVyJyB8fCAnY2VudGVyJyB8fCB6ZXJvVG9PbmVcbiAgICAgICAgIHwgfVxuICAgICAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGRyb3B6b25lOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3AuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0T25FdmVudHMoJ2Ryb3AnLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICB0aGlzLmFjY2VwdChvcHRpb25zLmFjY2VwdCk7XG5cbiAgICAgICAgICAgICAgICBpZiAoL14ocG9pbnRlcnxjZW50ZXIpJC8udGVzdChvcHRpb25zLm92ZXJsYXApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLm92ZXJsYXAgPSBvcHRpb25zLm92ZXJsYXA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2UgaWYgKGlzTnVtYmVyKG9wdGlvbnMub3ZlcmxhcCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3Aub3ZlcmxhcCA9IE1hdGgubWF4KE1hdGgubWluKDEsIG9wdGlvbnMub3ZlcmxhcCksIDApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3AuZW5hYmxlZCA9IG9wdGlvbnM7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcm9wO1xuICAgICAgICB9LFxuXG4gICAgICAgIGRyb3BDaGVjazogZnVuY3Rpb24gKHBvaW50ZXIsIGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudCwgZHJvcEVsZW1lbnQsIHJlY3QpIHtcbiAgICAgICAgICAgIHZhciBkcm9wcGVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIGlmIHRoZSBkcm9wem9uZSBoYXMgbm8gcmVjdCAoZWcuIGRpc3BsYXk6IG5vbmUpXG4gICAgICAgICAgICAvLyBjYWxsIHRoZSBjdXN0b20gZHJvcENoZWNrZXIgb3IganVzdCByZXR1cm4gZmFsc2VcbiAgICAgICAgICAgIGlmICghKHJlY3QgPSByZWN0IHx8IHRoaXMuZ2V0UmVjdChkcm9wRWxlbWVudCkpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuICh0aGlzLm9wdGlvbnMuZHJvcENoZWNrZXJcbiAgICAgICAgICAgICAgICAgICAgPyB0aGlzLm9wdGlvbnMuZHJvcENoZWNrZXIocG9pbnRlciwgZHJvcHBlZCwgdGhpcywgZHJvcEVsZW1lbnQsIGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudClcbiAgICAgICAgICAgICAgICAgICAgOiBmYWxzZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkcm9wT3ZlcmxhcCA9IHRoaXMub3B0aW9ucy5kcm9wLm92ZXJsYXA7XG5cbiAgICAgICAgICAgIGlmIChkcm9wT3ZlcmxhcCA9PT0gJ3BvaW50ZXInKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhZ2UgPSBnZXRQYWdlWFkocG9pbnRlciksXG4gICAgICAgICAgICAgICAgICAgIG9yaWdpbiA9IGdldE9yaWdpblhZKGRyYWdnYWJsZSwgZHJhZ2dhYmxlRWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIGhvcml6b250YWwsXG4gICAgICAgICAgICAgICAgICAgIHZlcnRpY2FsO1xuXG4gICAgICAgICAgICAgICAgcGFnZS54ICs9IG9yaWdpbi54O1xuICAgICAgICAgICAgICAgIHBhZ2UueSArPSBvcmlnaW4ueTtcblxuICAgICAgICAgICAgICAgIGhvcml6b250YWwgPSAocGFnZS54ID4gcmVjdC5sZWZ0KSAmJiAocGFnZS54IDwgcmVjdC5yaWdodCk7XG4gICAgICAgICAgICAgICAgdmVydGljYWwgICA9IChwYWdlLnkgPiByZWN0LnRvcCApICYmIChwYWdlLnkgPCByZWN0LmJvdHRvbSk7XG5cbiAgICAgICAgICAgICAgICBkcm9wcGVkID0gaG9yaXpvbnRhbCAmJiB2ZXJ0aWNhbDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGRyYWdSZWN0ID0gZHJhZ2dhYmxlLmdldFJlY3QoZHJhZ2dhYmxlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChkcm9wT3ZlcmxhcCA9PT0gJ2NlbnRlcicpIHtcbiAgICAgICAgICAgICAgICB2YXIgY3ggPSBkcmFnUmVjdC5sZWZ0ICsgZHJhZ1JlY3Qud2lkdGggIC8gMixcbiAgICAgICAgICAgICAgICAgICAgY3kgPSBkcmFnUmVjdC50b3AgICsgZHJhZ1JlY3QuaGVpZ2h0IC8gMjtcblxuICAgICAgICAgICAgICAgIGRyb3BwZWQgPSBjeCA+PSByZWN0LmxlZnQgJiYgY3ggPD0gcmVjdC5yaWdodCAmJiBjeSA+PSByZWN0LnRvcCAmJiBjeSA8PSByZWN0LmJvdHRvbTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzTnVtYmVyKGRyb3BPdmVybGFwKSkge1xuICAgICAgICAgICAgICAgIHZhciBvdmVybGFwQXJlYSAgPSAoTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVjdC5yaWdodCAsIGRyYWdSZWN0LnJpZ2h0ICkgLSBNYXRoLm1heChyZWN0LmxlZnQsIGRyYWdSZWN0LmxlZnQpKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICogTWF0aC5tYXgoMCwgTWF0aC5taW4ocmVjdC5ib3R0b20sIGRyYWdSZWN0LmJvdHRvbSkgLSBNYXRoLm1heChyZWN0LnRvcCAsIGRyYWdSZWN0LnRvcCApKSksXG4gICAgICAgICAgICAgICAgICAgIG92ZXJsYXBSYXRpbyA9IG92ZXJsYXBBcmVhIC8gKGRyYWdSZWN0LndpZHRoICogZHJhZ1JlY3QuaGVpZ2h0KTtcblxuICAgICAgICAgICAgICAgIGRyb3BwZWQgPSBvdmVybGFwUmF0aW8gPj0gZHJvcE92ZXJsYXA7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdGlvbnMuZHJvcENoZWNrZXIpIHtcbiAgICAgICAgICAgICAgICBkcm9wcGVkID0gdGhpcy5vcHRpb25zLmRyb3BDaGVja2VyKHBvaW50ZXIsIGRyb3BwZWQsIHRoaXMsIGRyb3BFbGVtZW50LCBkcmFnZ2FibGUsIGRyYWdnYWJsZUVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZHJvcHBlZDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5kcm9wQ2hlY2tlclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gY2hlY2sgaWYgYSBkcmFnZ2VkIGVsZW1lbnQgaXNcbiAgICAgICAgICogb3ZlciB0aGlzIEludGVyYWN0YWJsZS4gU2VlIEBJbnRlcmFjdGFibGUuZHJvcENoZWNrLlxuICAgICAgICAgKlxuICAgICAgICAgLSBjaGVja2VyIChmdW5jdGlvbikgI29wdGlvbmFsXG4gICAgICAgICAqIFRoZSBjaGVja2VyIGlzIGEgZnVuY3Rpb24gd2hpY2ggdGFrZXMgYSBtb3VzZVVwL3RvdWNoRW5kIGV2ZW50IGFzIGFcbiAgICAgICAgICogcGFyYW1ldGVyIGFuZCByZXR1cm5zIHRydWUgb3IgZmFsc2UgdG8gaW5kaWNhdGUgaWYgdGhlIHRoZSBjdXJyZW50XG4gICAgICAgICAqIGRyYWdnYWJsZSBjYW4gYmUgZHJvcHBlZCBpbnRvIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqXG4gICAgICAgICAtIGNoZWNrZXIgKGZ1bmN0aW9uKSBUaGUgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGNhbGxlZCB3aGVuIGNoZWNraW5nIGZvciBhIGRyb3BcbiAgICAgICAgICogVGhlIGNoZWNrZXIgZnVuY3Rpb24gdGFrZXMgdGhlIGZvbGxvd2luZyBhcmd1bWVudHM6XG4gICAgICAgICAqXG4gICAgICAgICAtIHBvaW50ZXIgKE1vdXNlRXZlbnQgfCBQb2ludGVyRXZlbnQgfCBUb3VjaCkgVGhlIHBvaW50ZXIvZXZlbnQgdGhhdCBlbmRzIGEgZHJhZ1xuICAgICAgICAgLSBkcm9wcGVkIChib29sZWFuKSBUaGUgdmFsdWUgZnJvbSB0aGUgZGVmYXVsdCBkcm9wIGNoZWNrXG4gICAgICAgICAtIGRyb3B6b25lIChJbnRlcmFjdGFibGUpIFRoZSBkcm9wem9uZSBpbnRlcmFjdGFibGVcbiAgICAgICAgIC0gZHJvcEVsZW1lbnQgKEVsZW1lbnQpIFRoZSBkcm9wem9uZSBlbGVtZW50XG4gICAgICAgICAtIGRyYWdnYWJsZSAoSW50ZXJhY3RhYmxlKSBUaGUgSW50ZXJhY3RhYmxlIGJlaW5nIGRyYWdnZWRcbiAgICAgICAgIC0gZHJhZ2dhYmxlRWxlbWVudCAoRWxlbWVudCkgVGhlIGFjdHVhbCBlbGVtZW50IHRoYXQncyBiZWluZyBkcmFnZ2VkXG4gICAgICAgICAqXG4gICAgICAgICA9IChGdW5jdGlvbiB8IEludGVyYWN0YWJsZSkgVGhlIGNoZWNrZXIgZnVuY3Rpb24gb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBkcm9wQ2hlY2tlcjogZnVuY3Rpb24gKGNoZWNrZXIpIHtcbiAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKGNoZWNrZXIpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmRyb3BDaGVja2VyID0gY2hlY2tlcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmdldFJlY3Q7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5kcm9wQ2hlY2tlcjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hY2NlcHRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogRGVwcmVjYXRlZC4gYWRkIGFuIGBhY2NlcHRgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdCBwYXNzZWQgdG9cbiAgICAgICAgICogQEludGVyYWN0YWJsZS5kcm9wem9uZSBpbnN0ZWFkLlxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIEVsZW1lbnQgb3IgQ1NTIHNlbGVjdG9yIG1hdGNoIHRoYXQgdGhpc1xuICAgICAgICAgKiBJbnRlcmFjdGFibGUgYWNjZXB0cyBpZiBpdCBpcyBhIGRyb3B6b25lLlxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoRWxlbWVudCB8IHN0cmluZyB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgKiBJZiBpdCBpcyBhbiBFbGVtZW50LCB0aGVuIG9ubHkgdGhhdCBlbGVtZW50IGNhbiBiZSBkcm9wcGVkIGludG8gdGhpcyBkcm9wem9uZS5cbiAgICAgICAgICogSWYgaXQgaXMgYSBzdHJpbmcsIHRoZSBlbGVtZW50IGJlaW5nIGRyYWdnZWQgbXVzdCBtYXRjaCBpdCBhcyBhIHNlbGVjdG9yLlxuICAgICAgICAgKiBJZiBpdCBpcyBudWxsLCB0aGUgYWNjZXB0IG9wdGlvbnMgaXMgY2xlYXJlZCAtIGl0IGFjY2VwdHMgYW55IGVsZW1lbnQuXG4gICAgICAgICAqXG4gICAgICAgICA9IChzdHJpbmcgfCBFbGVtZW50IHwgbnVsbCB8IEludGVyYWN0YWJsZSkgVGhlIGN1cnJlbnQgYWNjZXB0IG9wdGlvbiBpZiBnaXZlbiBgdW5kZWZpbmVkYCBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGFjY2VwdDogZnVuY3Rpb24gKG5ld1ZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoaXNFbGVtZW50KG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kcm9wLmFjY2VwdCA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHRlc3QgaWYgaXQgaXMgYSB2YWxpZCBDU1Mgc2VsZWN0b3JcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAobmV3VmFsdWUgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmRyb3AuYWNjZXB0O1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZHJvcC5hY2NlcHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVzaXphYmxlXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgb3Igc2V0cyB3aGV0aGVyIHJlc2l6ZSBhY3Rpb25zIGNhbiBiZSBwZXJmb3JtZWQgb24gdGhlXG4gICAgICAgICAqIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgPSAoYm9vbGVhbikgSW5kaWNhdGVzIGlmIHRoaXMgY2FuIGJlIHRoZSB0YXJnZXQgb2YgcmVzaXplIGVsZW1lbnRzXG4gICAgICAgICB8IHZhciBpc1Jlc2l6ZWFibGUgPSBpbnRlcmFjdCgnaW5wdXRbdHlwZT10ZXh0XScpLnJlc2l6YWJsZSgpO1xuICAgICAgICAgKiBvclxuICAgICAgICAgLSBvcHRpb25zIChib29sZWFuIHwgb2JqZWN0KSAjb3B0aW9uYWwgdHJ1ZS9mYWxzZSBvciBBbiBvYmplY3Qgd2l0aCBldmVudCBsaXN0ZW5lcnMgdG8gYmUgZmlyZWQgb24gcmVzaXplIGV2ZW50cyAob2JqZWN0IG1ha2VzIHRoZSBJbnRlcmFjdGFibGUgcmVzaXphYmxlKVxuICAgICAgICAgPSAob2JqZWN0KSBUaGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5yZXNpemFibGUoe1xuICAgICAgICAgfCAgICAgb25zdGFydDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9ubW92ZSA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8ICAgICBvbmVuZCAgOiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgZWRnZXM6IHtcbiAgICAgICAgIHwgICAgICAgdG9wICAgOiB0cnVlLCAgICAgICAvLyBVc2UgcG9pbnRlciBjb29yZHMgdG8gY2hlY2sgZm9yIHJlc2l6ZS5cbiAgICAgICAgIHwgICAgICAgbGVmdCAgOiBmYWxzZSwgICAgICAvLyBEaXNhYmxlIHJlc2l6aW5nIGZyb20gbGVmdCBlZGdlLlxuICAgICAgICAgfCAgICAgICBib3R0b206ICcucmVzaXplLXMnLC8vIFJlc2l6ZSBpZiBwb2ludGVyIHRhcmdldCBtYXRjaGVzIHNlbGVjdG9yXG4gICAgICAgICB8ICAgICAgIHJpZ2h0IDogaGFuZGxlRWwgICAgLy8gUmVzaXplIGlmIHBvaW50ZXIgdGFyZ2V0IGlzIHRoZSBnaXZlbiBFbGVtZW50XG4gICAgICAgICB8ICAgICB9LFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYSB2YWx1ZSBvZiAnbm9uZScgd2lsbCBsaW1pdCB0aGUgcmVzaXplIHJlY3QgdG8gYSBtaW5pbXVtIG9mIDB4MFxuICAgICAgICAgfCAgICAgLy8gJ25lZ2F0ZScgd2lsbCBhbGxvdyB0aGUgcmVjdCB0byBoYXZlIG5lZ2F0aXZlIHdpZHRoL2hlaWdodFxuICAgICAgICAgfCAgICAgLy8gJ3JlcG9zaXRpb24nIHdpbGwga2VlcCB0aGUgd2lkdGgvaGVpZ2h0IHBvc2l0aXZlIGJ5IHN3YXBwaW5nXG4gICAgICAgICB8ICAgICAvLyB0aGUgdG9wIGFuZCBib3R0b20gZWRnZXMgYW5kL29yIHN3YXBwaW5nIHRoZSBsZWZ0IGFuZCByaWdodCBlZGdlc1xuICAgICAgICAgfCAgICAgaW52ZXJ0OiAnbm9uZScgfHwgJ25lZ2F0ZScgfHwgJ3JlcG9zaXRpb24nXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBsaW1pdCBtdWx0aXBsZSByZXNpemVzLlxuICAgICAgICAgfCAgICAgLy8gU2VlIHRoZSBleHBsYW5hdGlvbiBpbiB0aGUgQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgZXhhbXBsZVxuICAgICAgICAgfCAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgIHwgICAgIG1heFBlckVsZW1lbnQ6IDEsXG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIHJlc2l6YWJsZTogZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICAgICAgICAgIGlmIChpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5yZXNpemUuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuICAgICAgICAgICAgICAgIHRoaXMuc2V0UGVyQWN0aW9uKCdyZXNpemUnLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldE9uRXZlbnRzKCdyZXNpemUnLCBvcHRpb25zKTtcblxuICAgICAgICAgICAgICAgIGlmICgvXngkfF55JHxeeHkkLy50ZXN0KG9wdGlvbnMuYXhpcykpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5heGlzID0gb3B0aW9ucy5heGlzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChvcHRpb25zLmF4aXMgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5heGlzID0gZGVmYXVsdE9wdGlvbnMucmVzaXplLmF4aXM7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKGlzQm9vbChvcHRpb25zLnNxdWFyZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmUgPSBvcHRpb25zLnNxdWFyZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLmVuYWJsZWQgPSBvcHRpb25zO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnJlc2l6ZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zcXVhcmVSZXNpemVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogRGVwcmVjYXRlZC4gQWRkIGEgYHNxdWFyZTogdHJ1ZSB8fCBmYWxzZWAgcHJvcGVydHkgdG8gQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZFxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciByZXNpemluZyBpcyBmb3JjZWQgMToxIGFzcGVjdFxuICAgICAgICAgKlxuICAgICAgICAgPSAoYm9vbGVhbikgQ3VycmVudCBzZXR0aW5nXG4gICAgICAgICAqXG4gICAgICAgICAqIG9yXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWxcbiAgICAgICAgID0gKG9iamVjdCkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBzcXVhcmVSZXNpemU6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMucmVzaXplLnNxdWFyZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMucmVzaXplLnNxdWFyZTtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnJlc2l6ZS5zcXVhcmU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuZ2VzdHVyYWJsZVxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgd2hldGhlciBtdWx0aXRvdWNoIGdlc3R1cmVzIGNhbiBiZSBwZXJmb3JtZWQgb24gdGhlXG4gICAgICAgICAqIEludGVyYWN0YWJsZSdzIGVsZW1lbnRcbiAgICAgICAgICpcbiAgICAgICAgID0gKGJvb2xlYW4pIEluZGljYXRlcyBpZiB0aGlzIGNhbiBiZSB0aGUgdGFyZ2V0IG9mIGdlc3R1cmUgZXZlbnRzXG4gICAgICAgICB8IHZhciBpc0dlc3R1cmVhYmxlID0gaW50ZXJhY3QoZWxlbWVudCkuZ2VzdHVyYWJsZSgpO1xuICAgICAgICAgKiBvclxuICAgICAgICAgLSBvcHRpb25zIChib29sZWFuIHwgb2JqZWN0KSAjb3B0aW9uYWwgdHJ1ZS9mYWxzZSBvciBBbiBvYmplY3Qgd2l0aCBldmVudCBsaXN0ZW5lcnMgdG8gYmUgZmlyZWQgb24gZ2VzdHVyZSBldmVudHMgKG1ha2VzIHRoZSBJbnRlcmFjdGFibGUgZ2VzdHVyYWJsZSlcbiAgICAgICAgID0gKG9iamVjdCkgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCkuZ2VzdHVyYWJsZSh7XG4gICAgICAgICB8ICAgICBvbnN0YXJ0OiBmdW5jdGlvbiAoZXZlbnQpIHt9LFxuICAgICAgICAgfCAgICAgb25tb3ZlIDogZnVuY3Rpb24gKGV2ZW50KSB7fSxcbiAgICAgICAgIHwgICAgIG9uZW5kICA6IGZ1bmN0aW9uIChldmVudCkge30sXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBsaW1pdCBtdWx0aXBsZSBnZXN0dXJlcy5cbiAgICAgICAgIHwgICAgIC8vIFNlZSB0aGUgZXhwbGFuYXRpb24gaW4gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgZXhhbXBsZVxuICAgICAgICAgfCAgICAgbWF4OiBJbmZpbml0eSxcbiAgICAgICAgIHwgICAgIG1heFBlckVsZW1lbnQ6IDEsXG4gICAgICAgICB8IH0pO1xuICAgICAgICBcXCovXG4gICAgICAgIGdlc3R1cmFibGU6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuZ2VzdHVyZS5lbmFibGVkID0gb3B0aW9ucy5lbmFibGVkID09PSBmYWxzZT8gZmFsc2U6IHRydWU7XG4gICAgICAgICAgICAgICAgdGhpcy5zZXRQZXJBY3Rpb24oJ2dlc3R1cmUnLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICB0aGlzLnNldE9uRXZlbnRzKCdnZXN0dXJlJywgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzQm9vbChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5nZXN0dXJlLmVuYWJsZWQgPSBvcHRpb25zO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZ2VzdHVyZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5hdXRvU2Nyb2xsXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqKlxuICAgICAgICAgKiBEZXByZWNhdGVkLiBBZGQgYW4gYGF1dG9zY3JvbGxgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdFxuICAgICAgICAgKiBwYXNzZWQgdG8gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgb3IgQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZHJhZ2dpbmcgYW5kIHJlc2l6aW5nIG5lYXIgdGhlIGVkZ2VzIG9mIHRoZVxuICAgICAgICAgKiB3aW5kb3cvY29udGFpbmVyIHRyaWdnZXIgYXV0b1Njcm9sbCBmb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICpcbiAgICAgICAgID0gKG9iamVjdCkgT2JqZWN0IHdpdGggYXV0b1Njcm9sbCBwcm9wZXJ0aWVzXG4gICAgICAgICAqXG4gICAgICAgICAqIG9yXG4gICAgICAgICAqXG4gICAgICAgICAtIG9wdGlvbnMgKG9iamVjdCB8IGJvb2xlYW4pICNvcHRpb25hbFxuICAgICAgICAgKiBvcHRpb25zIGNhbiBiZTpcbiAgICAgICAgICogLSBhbiBvYmplY3Qgd2l0aCBtYXJnaW4sIGRpc3RhbmNlIGFuZCBpbnRlcnZhbCBwcm9wZXJ0aWVzLFxuICAgICAgICAgKiAtIHRydWUgb3IgZmFsc2UgdG8gZW5hYmxlIG9yIGRpc2FibGUgYXV0b1Njcm9sbCBvclxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGF1dG9TY3JvbGw6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0gZXh0ZW5kKHsgYWN0aW9uczogWydkcmFnJywgJ3Jlc2l6ZSddfSwgb3B0aW9ucyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc0Jvb2wob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICBvcHRpb25zID0geyBhY3Rpb25zOiBbJ2RyYWcnLCAncmVzaXplJ10sIGVuYWJsZWQ6IG9wdGlvbnMgfTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9ucygnYXV0b1Njcm9sbCcsIG9wdGlvbnMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnNuYXBcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICoqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIEFkZCBhIGBzbmFwYCBwcm9wZXJ0eSB0byB0aGUgb3B0aW9ucyBvYmplY3QgcGFzc2VkXG4gICAgICAgICAqIHRvIEBJbnRlcmFjdGFibGUuZHJhZ2dhYmxlIG9yIEBJbnRlcmFjdGFibGUucmVzaXphYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyBpZiBhbmQgaG93IGFjdGlvbiBjb29yZGluYXRlcyBhcmUgc25hcHBlZC4gQnlcbiAgICAgICAgICogZGVmYXVsdCwgc25hcHBpbmcgaXMgcmVsYXRpdmUgdG8gdGhlIHBvaW50ZXIgY29vcmRpbmF0ZXMuIFlvdSBjYW5cbiAgICAgICAgICogY2hhbmdlIHRoaXMgYnkgc2V0dGluZyB0aGVcbiAgICAgICAgICogW2BlbGVtZW50T3JpZ2luYF0oaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MikuXG4gICAgICAgICAqKlxuICAgICAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgYGZhbHNlYCBpZiBzbmFwIGlzIGRpc2FibGVkOyBvYmplY3Qgd2l0aCBzbmFwIHByb3BlcnRpZXMgaWYgc25hcCBpcyBlbmFibGVkXG4gICAgICAgICAqKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKipcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0IHwgYm9vbGVhbiB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPiBVc2FnZVxuICAgICAgICAgfCBpbnRlcmFjdChkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcjdGhpbmcnKSkuc25hcCh7XG4gICAgICAgICB8ICAgICB0YXJnZXRzOiBbXG4gICAgICAgICB8ICAgICAgICAgLy8gc25hcCB0byB0aGlzIHNwZWNpZmljIHBvaW50XG4gICAgICAgICB8ICAgICAgICAge1xuICAgICAgICAgfCAgICAgICAgICAgICB4OiAxMDAsXG4gICAgICAgICB8ICAgICAgICAgICAgIHk6IDEwMCxcbiAgICAgICAgIHwgICAgICAgICAgICAgcmFuZ2U6IDI1XG4gICAgICAgICB8ICAgICAgICAgfSxcbiAgICAgICAgIHwgICAgICAgICAvLyBnaXZlIHRoaXMgZnVuY3Rpb24gdGhlIHggYW5kIHkgcGFnZSBjb29yZHMgYW5kIHNuYXAgdG8gdGhlIG9iamVjdCByZXR1cm5lZFxuICAgICAgICAgfCAgICAgICAgIGZ1bmN0aW9uICh4LCB5KSB7XG4gICAgICAgICB8ICAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICB8ICAgICAgICAgICAgICAgICB4OiB4LFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgeTogKDc1ICsgNTAgKiBNYXRoLnNpbih4ICogMC4wNCkpLFxuICAgICAgICAgfCAgICAgICAgICAgICAgICAgcmFuZ2U6IDQwXG4gICAgICAgICB8ICAgICAgICAgICAgIH07XG4gICAgICAgICB8ICAgICAgICAgfSxcbiAgICAgICAgIHwgICAgICAgICAvLyBjcmVhdGUgYSBmdW5jdGlvbiB0aGF0IHNuYXBzIHRvIGEgZ3JpZFxuICAgICAgICAgfCAgICAgICAgIGludGVyYWN0LmNyZWF0ZVNuYXBHcmlkKHtcbiAgICAgICAgIHwgICAgICAgICAgICAgeDogNTAsXG4gICAgICAgICB8ICAgICAgICAgICAgIHk6IDUwLFxuICAgICAgICAgfCAgICAgICAgICAgICByYW5nZTogMTAsICAgICAgICAgICAgICAvLyBvcHRpb25hbFxuICAgICAgICAgfCAgICAgICAgICAgICBvZmZzZXQ6IHsgeDogNSwgeTogMTAgfSAvLyBvcHRpb25hbFxuICAgICAgICAgfCAgICAgICAgIH0pXG4gICAgICAgICB8ICAgICBdLFxuICAgICAgICAgfCAgICAgLy8gZG8gbm90IHNuYXAgZHVyaW5nIG5vcm1hbCBtb3ZlbWVudC5cbiAgICAgICAgIHwgICAgIC8vIEluc3RlYWQsIHRyaWdnZXIgb25seSBvbmUgc25hcHBlZCBtb3ZlIGV2ZW50XG4gICAgICAgICB8ICAgICAvLyBpbW1lZGlhdGVseSBiZWZvcmUgdGhlIGVuZCBldmVudC5cbiAgICAgICAgIHwgICAgIGVuZE9ubHk6IHRydWUsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICByZWxhdGl2ZVBvaW50czogW1xuICAgICAgICAgfCAgICAgICAgIHsgeDogMCwgeTogMCB9LCAgLy8gc25hcCByZWxhdGl2ZSB0byB0aGUgdG9wIGxlZnQgb2YgdGhlIGVsZW1lbnRcbiAgICAgICAgIHwgICAgICAgICB7IHg6IDEsIHk6IDEgfSwgIC8vIGFuZCBhbHNvIHRvIHRoZSBib3R0b20gcmlnaHRcbiAgICAgICAgIHwgICAgIF0sICBcbiAgICAgICAgIHxcbiAgICAgICAgIHwgICAgIC8vIG9mZnNldCB0aGUgc25hcCB0YXJnZXQgY29vcmRpbmF0ZXNcbiAgICAgICAgIHwgICAgIC8vIGNhbiBiZSBhbiBvYmplY3Qgd2l0aCB4L3kgb3IgJ3N0YXJ0Q29vcmRzJ1xuICAgICAgICAgfCAgICAgb2Zmc2V0OiB7IHg6IDUwLCB5OiA1MCB9XG4gICAgICAgICB8ICAgfVxuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBzbmFwOiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgdmFyIHJldCA9IHRoaXMuc2V0T3B0aW9ucygnc25hcCcsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICBpZiAocmV0ID09PSB0aGlzKSB7IHJldHVybiB0aGlzOyB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXQuZHJhZztcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRPcHRpb25zOiBmdW5jdGlvbiAob3B0aW9uLCBvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgYWN0aW9ucyA9IG9wdGlvbnMgJiYgaXNBcnJheShvcHRpb25zLmFjdGlvbnMpXG4gICAgICAgICAgICAgICAgICAgID8gb3B0aW9ucy5hY3Rpb25zXG4gICAgICAgICAgICAgICAgICAgIDogWydkcmFnJ107XG5cbiAgICAgICAgICAgIHZhciBpO1xuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykgfHwgaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFjdGlvbiA9IC9yZXNpemUvLnRlc3QoYWN0aW9uc1tpXSk/ICdyZXNpemUnIDogYWN0aW9uc1tpXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIWlzT2JqZWN0KHRoaXMub3B0aW9uc1thY3Rpb25dKSkgeyBjb250aW51ZTsgfVxuXG4gICAgICAgICAgICAgICAgICAgIHZhciB0aGlzT3B0aW9uID0gdGhpcy5vcHRpb25zW2FjdGlvbl1bb3B0aW9uXTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNPYmplY3Qob3B0aW9ucykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV4dGVuZCh0aGlzT3B0aW9uLCBvcHRpb25zKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24uZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2U/IGZhbHNlOiB0cnVlO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9uID09PSAnc25hcCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGhpc09wdGlvbi5tb2RlID09PSAnZ3JpZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpc09wdGlvbi50YXJnZXRzID0gW1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW50ZXJhY3QuY3JlYXRlU25hcEdyaWQoZXh0ZW5kKHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmZzZXQ6IHRoaXNPcHRpb24uZ3JpZE9mZnNldCB8fCB7IHg6IDAsIHk6IDAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgdGhpc09wdGlvbi5ncmlkIHx8IHt9KSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAodGhpc09wdGlvbi5tb2RlID09PSAnYW5jaG9yJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLnRhcmdldHMgPSB0aGlzT3B0aW9uLmFuY2hvcnM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKHRoaXNPcHRpb24ubW9kZSA9PT0gJ3BhdGgnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24udGFyZ2V0cyA9IHRoaXNPcHRpb24ucGF0aHM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCdlbGVtZW50T3JpZ2luJyBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXNPcHRpb24ucmVsYXRpdmVQb2ludHMgPSBbb3B0aW9ucy5lbGVtZW50T3JpZ2luXTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgZWxzZSBpZiAoaXNCb29sKG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzT3B0aW9uLmVuYWJsZWQgPSBvcHRpb25zO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciByZXQgPSB7fSxcbiAgICAgICAgICAgICAgICBhbGxBY3Rpb25zID0gWydkcmFnJywgJ3Jlc2l6ZScsICdnZXN0dXJlJ107XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhbGxBY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKG9wdGlvbiBpbiBkZWZhdWx0T3B0aW9uc1thbGxBY3Rpb25zW2ldXSkge1xuICAgICAgICAgICAgICAgICAgICByZXRbYWxsQWN0aW9uc1tpXV0gPSB0aGlzLm9wdGlvbnNbYWxsQWN0aW9uc1tpXV1bb3B0aW9uXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiByZXQ7XG4gICAgICAgIH0sXG5cblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5pbmVydGlhXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqKlxuICAgICAgICAgKiBEZXByZWNhdGVkLiBBZGQgYW4gYGluZXJ0aWFgIHByb3BlcnR5IHRvIHRoZSBvcHRpb25zIG9iamVjdCBwYXNzZWRcbiAgICAgICAgICogdG8gQEludGVyYWN0YWJsZS5kcmFnZ2FibGUgb3IgQEludGVyYWN0YWJsZS5yZXNpemFibGUgaW5zdGVhZC5cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIGlmIGFuZCBob3cgZXZlbnRzIGNvbnRpbnVlIHRvIHJ1biBhZnRlciB0aGUgcG9pbnRlciBpcyByZWxlYXNlZFxuICAgICAgICAgKipcbiAgICAgICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIGBmYWxzZWAgaWYgaW5lcnRpYSBpcyBkaXNhYmxlZDsgYG9iamVjdGAgd2l0aCBpbmVydGlhIHByb3BlcnRpZXMgaWYgaW5lcnRpYSBpcyBlbmFibGVkXG4gICAgICAgICAqKlxuICAgICAgICAgKiBvclxuICAgICAgICAgKipcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0IHwgYm9vbGVhbiB8IG51bGwpICNvcHRpb25hbFxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPiBVc2FnZVxuICAgICAgICAgfCAvLyBlbmFibGUgYW5kIHVzZSBkZWZhdWx0IHNldHRpbmdzXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQpLmluZXJ0aWEodHJ1ZSk7XG4gICAgICAgICB8XG4gICAgICAgICB8IC8vIGVuYWJsZSBhbmQgdXNlIGN1c3RvbSBzZXR0aW5nc1xuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pbmVydGlhKHtcbiAgICAgICAgIHwgICAgIC8vIHZhbHVlIGdyZWF0ZXIgdGhhbiAwXG4gICAgICAgICB8ICAgICAvLyBoaWdoIHZhbHVlcyBzbG93IHRoZSBvYmplY3QgZG93biBtb3JlIHF1aWNrbHlcbiAgICAgICAgIHwgICAgIHJlc2lzdGFuY2UgICAgIDogMTYsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyB0aGUgbWluaW11bSBsYXVuY2ggc3BlZWQgKHBpeGVscyBwZXIgc2Vjb25kKSB0aGF0IHJlc3VsdHMgaW4gaW5lcnRpYSBzdGFydFxuICAgICAgICAgfCAgICAgbWluU3BlZWQgICAgICAgOiAyMDAsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBpbmVydGlhIHdpbGwgc3RvcCB3aGVuIHRoZSBvYmplY3Qgc2xvd3MgZG93biB0byB0aGlzIHNwZWVkXG4gICAgICAgICB8ICAgICBlbmRTcGVlZCAgICAgICA6IDIwLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYm9vbGVhbjsgc2hvdWxkIGFjdGlvbnMgYmUgcmVzdW1lZCB3aGVuIHRoZSBwb2ludGVyIGdvZXMgZG93biBkdXJpbmcgaW5lcnRpYVxuICAgICAgICAgfCAgICAgYWxsb3dSZXN1bWUgICAgOiB0cnVlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gYm9vbGVhbjsgc2hvdWxkIHRoZSBqdW1wIHdoZW4gcmVzdW1pbmcgZnJvbSBpbmVydGlhIGJlIGlnbm9yZWQgaW4gZXZlbnQuZHgvZHlcbiAgICAgICAgIHwgICAgIHplcm9SZXN1bWVEZWx0YTogZmFsc2UsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBpZiBzbmFwL3Jlc3RyaWN0IGFyZSBzZXQgdG8gYmUgZW5kT25seSBhbmQgaW5lcnRpYSBpcyBlbmFibGVkLCByZWxlYXNpbmdcbiAgICAgICAgIHwgICAgIC8vIHRoZSBwb2ludGVyIHdpdGhvdXQgdHJpZ2dlcmluZyBpbmVydGlhIHdpbGwgYW5pbWF0ZSBmcm9tIHRoZSByZWxlYXNlXG4gICAgICAgICB8ICAgICAvLyBwb2ludCB0byB0aGUgc25hcGVkL3Jlc3RyaWN0ZWQgcG9pbnQgaW4gdGhlIGdpdmVuIGFtb3VudCBvZiB0aW1lIChtcylcbiAgICAgICAgIHwgICAgIHNtb290aEVuZER1cmF0aW9uOiAzMDAsXG4gICAgICAgICB8XG4gICAgICAgICB8ICAgICAvLyBhbiBhcnJheSBvZiBhY3Rpb24gdHlwZXMgdGhhdCBjYW4gaGF2ZSBpbmVydGlhIChubyBnZXN0dXJlKVxuICAgICAgICAgfCAgICAgYWN0aW9ucyAgICAgICAgOiBbJ2RyYWcnLCAncmVzaXplJ11cbiAgICAgICAgIHwgfSk7XG4gICAgICAgICB8XG4gICAgICAgICB8IC8vIHJlc2V0IGN1c3RvbSBzZXR0aW5ncyBhbmQgdXNlIGFsbCBkZWZhdWx0c1xuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pbmVydGlhKG51bGwpO1xuICAgICAgICBcXCovXG4gICAgICAgIGluZXJ0aWE6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICB2YXIgcmV0ID0gdGhpcy5zZXRPcHRpb25zKCdpbmVydGlhJywgb3B0aW9ucyk7XG5cbiAgICAgICAgICAgIGlmIChyZXQgPT09IHRoaXMpIHsgcmV0dXJuIHRoaXM7IH1cblxuICAgICAgICAgICAgcmV0dXJuIHJldC5kcmFnO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldEFjdGlvbjogZnVuY3Rpb24gKHBvaW50ZXIsIGludGVyYWN0aW9uLCBlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgYWN0aW9uID0gdGhpcy5kZWZhdWx0QWN0aW9uQ2hlY2tlcihwb2ludGVyLCBpbnRlcmFjdGlvbiwgZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmICh0aGlzLm9wdGlvbnMuYWN0aW9uQ2hlY2tlcikge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuYWN0aW9uQ2hlY2tlcihwb2ludGVyLCBhY3Rpb24sIHRoaXMsIGVsZW1lbnQsIGludGVyYWN0aW9uKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGFjdGlvbjtcbiAgICAgICAgfSxcblxuICAgICAgICBkZWZhdWx0QWN0aW9uQ2hlY2tlcjogZGVmYXVsdEFjdGlvbkNoZWNrZXIsXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYWN0aW9uQ2hlY2tlclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBHZXRzIG9yIHNldHMgdGhlIGZ1bmN0aW9uIHVzZWQgdG8gY2hlY2sgYWN0aW9uIHRvIGJlIHBlcmZvcm1lZCBvblxuICAgICAgICAgKiBwb2ludGVyRG93blxuICAgICAgICAgKlxuICAgICAgICAgLSBjaGVja2VyIChmdW5jdGlvbiB8IG51bGwpICNvcHRpb25hbCBBIGZ1bmN0aW9uIHdoaWNoIHRha2VzIGEgcG9pbnRlciBldmVudCwgZGVmYXVsdEFjdGlvbiBzdHJpbmcsIGludGVyYWN0YWJsZSwgZWxlbWVudCBhbmQgaW50ZXJhY3Rpb24gYXMgcGFyYW1ldGVycyBhbmQgcmV0dXJucyBhbiBvYmplY3Qgd2l0aCBuYW1lIHByb3BlcnR5ICdkcmFnJyAncmVzaXplJyBvciAnZ2VzdHVyZScgYW5kIG9wdGlvbmFsbHkgYW4gYGVkZ2VzYCBvYmplY3Qgd2l0aCBib29sZWFuICd0b3AnLCAnbGVmdCcsICdib3R0b20nIGFuZCByaWdodCBwcm9wcy5cbiAgICAgICAgID0gKEZ1bmN0aW9uIHwgSW50ZXJhY3RhYmxlKSBUaGUgY2hlY2tlciBmdW5jdGlvbiBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgfCBpbnRlcmFjdCgnLnJlc2l6ZS1ob3JpeicpLmFjdGlvbkNoZWNrZXIoZnVuY3Rpb24gKGRlZmF1bHRBY3Rpb24sIGludGVyYWN0YWJsZSkge1xuICAgICAgICAgfCAgIHJldHVybiB7XG4gICAgICAgICB8ICAgICAvLyByZXNpemUgZnJvbSB0aGUgdG9wIGFuZCByaWdodCBlZGdlc1xuICAgICAgICAgfCAgICAgbmFtZTogJ3Jlc2l6ZScsXG4gICAgICAgICB8ICAgICBlZGdlczogeyB0b3A6IHRydWUsIHJpZ2h0OiB0cnVlIH1cbiAgICAgICAgIHwgICB9O1xuICAgICAgICAgfCB9KTtcbiAgICAgICAgXFwqL1xuICAgICAgICBhY3Rpb25DaGVja2VyOiBmdW5jdGlvbiAoY2hlY2tlcikge1xuICAgICAgICAgICAgaWYgKGlzRnVuY3Rpb24oY2hlY2tlcikpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuYWN0aW9uQ2hlY2tlciA9IGNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmFjdGlvbkNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5hY3Rpb25DaGVja2VyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmdldFJlY3RcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogVGhlIGRlZmF1bHQgZnVuY3Rpb24gdG8gZ2V0IGFuIEludGVyYWN0YWJsZXMgYm91bmRpbmcgcmVjdC4gQ2FuIGJlXG4gICAgICAgICAqIG92ZXJyaWRkZW4gdXNpbmcgQEludGVyYWN0YWJsZS5yZWN0Q2hlY2tlci5cbiAgICAgICAgICpcbiAgICAgICAgIC0gZWxlbWVudCAoRWxlbWVudCkgI29wdGlvbmFsIFRoZSBlbGVtZW50IHRvIG1lYXN1cmUuXG4gICAgICAgICA9IChvYmplY3QpIFRoZSBvYmplY3QncyBib3VuZGluZyByZWN0YW5nbGUuXG4gICAgICAgICBvIHtcbiAgICAgICAgIG8gICAgIHRvcCAgIDogMCxcbiAgICAgICAgIG8gICAgIGxlZnQgIDogMCxcbiAgICAgICAgIG8gICAgIGJvdHRvbTogMCxcbiAgICAgICAgIG8gICAgIHJpZ2h0IDogMCxcbiAgICAgICAgIG8gICAgIHdpZHRoIDogMCxcbiAgICAgICAgIG8gICAgIGhlaWdodDogMFxuICAgICAgICAgbyB9XG4gICAgICAgIFxcKi9cbiAgICAgICAgZ2V0UmVjdDogZnVuY3Rpb24gcmVjdENoZWNrIChlbGVtZW50KSB7XG4gICAgICAgICAgICBlbGVtZW50ID0gZWxlbWVudCB8fCB0aGlzLl9lbGVtZW50O1xuXG4gICAgICAgICAgICBpZiAodGhpcy5zZWxlY3RvciAmJiAhKGlzRWxlbWVudChlbGVtZW50KSkpIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50ID0gdGhpcy5fY29udGV4dC5xdWVyeVNlbGVjdG9yKHRoaXMuc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gZ2V0RWxlbWVudFJlY3QoZWxlbWVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVjdENoZWNrZXJcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBmdW5jdGlvbiB1c2VkIHRvIGNhbGN1bGF0ZSB0aGUgaW50ZXJhY3RhYmxlJ3NcbiAgICAgICAgICogZWxlbWVudCdzIHJlY3RhbmdsZVxuICAgICAgICAgKlxuICAgICAgICAgLSBjaGVja2VyIChmdW5jdGlvbikgI29wdGlvbmFsIEEgZnVuY3Rpb24gd2hpY2ggcmV0dXJucyB0aGlzIEludGVyYWN0YWJsZSdzIGJvdW5kaW5nIHJlY3RhbmdsZS4gU2VlIEBJbnRlcmFjdGFibGUuZ2V0UmVjdFxuICAgICAgICAgPSAoZnVuY3Rpb24gfCBvYmplY3QpIFRoZSBjaGVja2VyIGZ1bmN0aW9uIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgcmVjdENoZWNrZXI6IGZ1bmN0aW9uIChjaGVja2VyKSB7XG4gICAgICAgICAgICBpZiAoaXNGdW5jdGlvbihjaGVja2VyKSkge1xuICAgICAgICAgICAgICAgIHRoaXMuZ2V0UmVjdCA9IGNoZWNrZXI7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGNoZWNrZXIgPT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmdldFJlY3Q7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZ2V0UmVjdDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zdHlsZUN1cnNvclxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciB0aGUgYWN0aW9uIHRoYXQgd291bGQgYmUgcGVyZm9ybWVkIHdoZW4gdGhlXG4gICAgICAgICAqIG1vdXNlIG9uIHRoZSBlbGVtZW50IGFyZSBjaGVja2VkIG9uIGBtb3VzZW1vdmVgIHNvIHRoYXQgdGhlIGN1cnNvclxuICAgICAgICAgKiBtYXkgYmUgc3R5bGVkIGFwcHJvcHJpYXRlbHlcbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKGJvb2xlYW4pICNvcHRpb25hbFxuICAgICAgICAgPSAoYm9vbGVhbiB8IEludGVyYWN0YWJsZSkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIHN0eWxlQ3Vyc29yOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChpc0Jvb2wobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG5ld1ZhbHVlID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5zdHlsZUN1cnNvcjtcblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLnN0eWxlQ3Vyc29yO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnByZXZlbnREZWZhdWx0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB3aGV0aGVyIHRvIHByZXZlbnQgdGhlIGJyb3dzZXIncyBkZWZhdWx0IGJlaGF2aW91clxuICAgICAgICAgKiBpbiByZXNwb25zZSB0byBwb2ludGVyIGV2ZW50cy4gQ2FuIGJlIHNldCB0bzpcbiAgICAgICAgICogIC0gYCdhbHdheXMnYCB0byBhbHdheXMgcHJldmVudFxuICAgICAgICAgKiAgLSBgJ25ldmVyJ2AgdG8gbmV2ZXIgcHJldmVudFxuICAgICAgICAgKiAgLSBgJ2F1dG8nYCB0byBsZXQgaW50ZXJhY3QuanMgdHJ5IHRvIGRldGVybWluZSB3aGF0IHdvdWxkIGJlIGJlc3RcbiAgICAgICAgICpcbiAgICAgICAgIC0gbmV3VmFsdWUgKHN0cmluZykgI29wdGlvbmFsIGB0cnVlYCwgYGZhbHNlYCBvciBgJ2F1dG8nYFxuICAgICAgICAgPSAoc3RyaW5nIHwgSW50ZXJhY3RhYmxlKSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgcHJldmVudERlZmF1bHQ6IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKC9eKGFsd2F5c3xuZXZlcnxhdXRvKSQvLnRlc3QobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnByZXZlbnREZWZhdWx0ID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0Jvb2wobmV3VmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLnByZXZlbnREZWZhdWx0ID0gbmV3VmFsdWU/ICdhbHdheXMnIDogJ25ldmVyJztcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHRoaXMub3B0aW9ucy5wcmV2ZW50RGVmYXVsdDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5vcmlnaW5cbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogR2V0cyBvciBzZXRzIHRoZSBvcmlnaW4gb2YgdGhlIEludGVyYWN0YWJsZSdzIGVsZW1lbnQuICBUaGUgeCBhbmQgeVxuICAgICAgICAgKiBvZiB0aGUgb3JpZ2luIHdpbGwgYmUgc3VidHJhY3RlZCBmcm9tIGFjdGlvbiBldmVudCBjb29yZGluYXRlcy5cbiAgICAgICAgICpcbiAgICAgICAgIC0gb3JpZ2luIChvYmplY3QgfCBzdHJpbmcpICNvcHRpb25hbCBBbiBvYmplY3QgZWcuIHsgeDogMCwgeTogMCB9IG9yIHN0cmluZyAncGFyZW50JywgJ3NlbGYnIG9yIGFueSBDU1Mgc2VsZWN0b3JcbiAgICAgICAgICogT1JcbiAgICAgICAgIC0gb3JpZ2luIChFbGVtZW50KSAjb3B0aW9uYWwgQW4gSFRNTCBvciBTVkcgRWxlbWVudCB3aG9zZSByZWN0IHdpbGwgYmUgdXNlZFxuICAgICAgICAgKipcbiAgICAgICAgID0gKG9iamVjdCkgVGhlIGN1cnJlbnQgb3JpZ2luIG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgIFxcKi9cbiAgICAgICAgb3JpZ2luOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMub3JpZ2luID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpc09iamVjdChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMub3JpZ2luID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMub3JpZ2luO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmRlbHRhU291cmNlXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgbW91c2UgY29vcmRpbmF0ZSB0eXBlcyB1c2VkIHRvIGNhbGN1bGF0ZSB0aGVcbiAgICAgICAgICogbW92ZW1lbnQgb2YgdGhlIHBvaW50ZXIuXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChzdHJpbmcpICNvcHRpb25hbCBVc2UgJ2NsaWVudCcgaWYgeW91IHdpbGwgYmUgc2Nyb2xsaW5nIHdoaWxlIGludGVyYWN0aW5nOyBVc2UgJ3BhZ2UnIGlmIHlvdSB3YW50IGF1dG9TY3JvbGwgdG8gd29ya1xuICAgICAgICAgPSAoc3RyaW5nIHwgb2JqZWN0KSBUaGUgY3VycmVudCBkZWx0YVNvdXJjZSBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGRlbHRhU291cmNlOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmIChuZXdWYWx1ZSA9PT0gJ3BhZ2UnIHx8IG5ld1ZhbHVlID09PSAnY2xpZW50Jykge1xuICAgICAgICAgICAgICAgIHRoaXMub3B0aW9ucy5kZWx0YVNvdXJjZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzLm9wdGlvbnMuZGVsdGFTb3VyY2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUucmVzdHJpY3RcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICoqXG4gICAgICAgICAqIERlcHJlY2F0ZWQuIEFkZCBhIGByZXN0cmljdGAgcHJvcGVydHkgdG8gdGhlIG9wdGlvbnMgb2JqZWN0IHBhc3NlZCB0b1xuICAgICAgICAgKiBASW50ZXJhY3RhYmxlLmRyYWdnYWJsZSwgQEludGVyYWN0YWJsZS5yZXNpemFibGUgb3IgQEludGVyYWN0YWJsZS5nZXN0dXJhYmxlIGluc3RlYWQuXG4gICAgICAgICAqXG4gICAgICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgcmVjdGFuZ2xlcyB3aXRoaW4gd2hpY2ggYWN0aW9ucyBvbiB0aGlzXG4gICAgICAgICAqIGludGVyYWN0YWJsZSAoYWZ0ZXIgc25hcCBjYWxjdWxhdGlvbnMpIGFyZSByZXN0cmljdGVkLiBCeSBkZWZhdWx0LFxuICAgICAgICAgKiByZXN0cmljdGluZyBpcyByZWxhdGl2ZSB0byB0aGUgcG9pbnRlciBjb29yZGluYXRlcy4gWW91IGNhbiBjaGFuZ2VcbiAgICAgICAgICogdGhpcyBieSBzZXR0aW5nIHRoZVxuICAgICAgICAgKiBbYGVsZW1lbnRSZWN0YF0oaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MikuXG4gICAgICAgICAqKlxuICAgICAgICAgLSBvcHRpb25zIChvYmplY3QpICNvcHRpb25hbCBhbiBvYmplY3Qgd2l0aCBrZXlzIGRyYWcsIHJlc2l6ZSwgYW5kL29yIGdlc3R1cmUgd2hvc2UgdmFsdWVzIGFyZSByZWN0cywgRWxlbWVudHMsIENTUyBzZWxlY3RvcnMsIG9yICdwYXJlbnQnIG9yICdzZWxmJ1xuICAgICAgICAgPSAob2JqZWN0KSBUaGUgY3VycmVudCByZXN0cmljdGlvbnMgb2JqZWN0IG9yIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAqKlxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5yZXN0cmljdCh7XG4gICAgICAgICB8ICAgICAvLyB0aGUgcmVjdCB3aWxsIGJlIGBpbnRlcmFjdC5nZXRFbGVtZW50UmVjdChlbGVtZW50LnBhcmVudE5vZGUpYFxuICAgICAgICAgfCAgICAgZHJhZzogZWxlbWVudC5wYXJlbnROb2RlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8geCBhbmQgeSBhcmUgcmVsYXRpdmUgdG8gdGhlIHRoZSBpbnRlcmFjdGFibGUncyBvcmlnaW5cbiAgICAgICAgIHwgICAgIHJlc2l6ZTogeyB4OiAxMDAsIHk6IDEwMCwgd2lkdGg6IDIwMCwgaGVpZ2h0OiAyMDAgfVxuICAgICAgICAgfCB9KVxuICAgICAgICAgfFxuICAgICAgICAgfCBpbnRlcmFjdCgnLmRyYWdnYWJsZScpLnJlc3RyaWN0KHtcbiAgICAgICAgIHwgICAgIC8vIHRoZSByZWN0IHdpbGwgYmUgdGhlIHNlbGVjdGVkIGVsZW1lbnQncyBwYXJlbnRcbiAgICAgICAgIHwgICAgIGRyYWc6ICdwYXJlbnQnLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gZG8gbm90IHJlc3RyaWN0IGR1cmluZyBub3JtYWwgbW92ZW1lbnQuXG4gICAgICAgICB8ICAgICAvLyBJbnN0ZWFkLCB0cmlnZ2VyIG9ubHkgb25lIHJlc3RyaWN0ZWQgbW92ZSBldmVudFxuICAgICAgICAgfCAgICAgLy8gaW1tZWRpYXRlbHkgYmVmb3JlIHRoZSBlbmQgZXZlbnQuXG4gICAgICAgICB8ICAgICBlbmRPbmx5OiB0cnVlLFxuICAgICAgICAgfFxuICAgICAgICAgfCAgICAgLy8gaHR0cHM6Ly9naXRodWIuY29tL3RheWUvaW50ZXJhY3QuanMvcHVsbC83MiNpc3N1ZS00MTgxMzQ5M1xuICAgICAgICAgfCAgICAgZWxlbWVudFJlY3Q6IHsgdG9wOiAwLCBsZWZ0OiAwLCBib3R0b206IDEsIHJpZ2h0OiAxIH1cbiAgICAgICAgIHwgfSk7XG4gICAgICAgIFxcKi9cbiAgICAgICAgcmVzdHJpY3Q6IGZ1bmN0aW9uIChvcHRpb25zKSB7XG4gICAgICAgICAgICBpZiAoIWlzT2JqZWN0KG9wdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0T3B0aW9ucygncmVzdHJpY3QnLCBvcHRpb25zKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGFjdGlvbnMgPSBbJ2RyYWcnLCAncmVzaXplJywgJ2dlc3R1cmUnXSxcbiAgICAgICAgICAgICAgICByZXQ7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgIHZhciBhY3Rpb24gPSBhY3Rpb25zW2ldO1xuXG4gICAgICAgICAgICAgICAgaWYgKGFjdGlvbiBpbiBvcHRpb25zKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwZXJBY3Rpb24gPSBleHRlbmQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdGlvbnM6IFthY3Rpb25dLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlc3RyaWN0aW9uOiBvcHRpb25zW2FjdGlvbl1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0sIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgICAgIHJldCA9IHRoaXMuc2V0T3B0aW9ucygncmVzdHJpY3QnLCBwZXJBY3Rpb24pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIHJldDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5jb250ZXh0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEdldHMgdGhlIHNlbGVjdG9yIGNvbnRleHQgTm9kZSBvZiB0aGUgSW50ZXJhY3RhYmxlLiBUaGUgZGVmYXVsdCBpcyBgd2luZG93LmRvY3VtZW50YC5cbiAgICAgICAgICpcbiAgICAgICAgID0gKE5vZGUpIFRoZSBjb250ZXh0IE5vZGUgb2YgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICoqXG4gICAgICAgIFxcKi9cbiAgICAgICAgY29udGV4dDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRleHQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgX2NvbnRleHQ6IGRvY3VtZW50LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmlnbm9yZUZyb21cbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogSWYgdGhlIHRhcmdldCBvZiB0aGUgYG1vdXNlZG93bmAsIGBwb2ludGVyZG93bmAgb3IgYHRvdWNoc3RhcnRgXG4gICAgICAgICAqIGV2ZW50IG9yIGFueSBvZiBpdCdzIHBhcmVudHMgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvclxuICAgICAgICAgKiBFbGVtZW50LCBubyBkcmFnL3Jlc2l6ZS9nZXN0dXJlIGlzIHN0YXJ0ZWQuXG4gICAgICAgICAqXG4gICAgICAgICAtIG5ld1ZhbHVlIChzdHJpbmcgfCBFbGVtZW50IHwgbnVsbCkgI29wdGlvbmFsIGEgQ1NTIHNlbGVjdG9yIHN0cmluZywgYW4gRWxlbWVudCBvciBgbnVsbGAgdG8gbm90IGlnbm9yZSBhbnkgZWxlbWVudHNcbiAgICAgICAgID0gKHN0cmluZyB8IEVsZW1lbnQgfCBvYmplY3QpIFRoZSBjdXJyZW50IGlnbm9yZUZyb20gdmFsdWUgb3IgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgICoqXG4gICAgICAgICB8IGludGVyYWN0KGVsZW1lbnQsIHsgaWdub3JlRnJvbTogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ25vLWFjdGlvbicpIH0pO1xuICAgICAgICAgfCAvLyBvclxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5pZ25vcmVGcm9tKCdpbnB1dCwgdGV4dGFyZWEsIGEnKTtcbiAgICAgICAgXFwqL1xuICAgICAgICBpZ25vcmVGcm9tOiBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh0cnlTZWxlY3RvcihuZXdWYWx1ZSkpIHsgICAgICAgICAgICAvLyBDU1Mgc2VsZWN0b3IgdG8gbWF0Y2ggZXZlbnQudGFyZ2V0XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmlnbm9yZUZyb20gPSBuZXdWYWx1ZTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGlzRWxlbWVudChuZXdWYWx1ZSkpIHsgICAgICAgICAgICAgIC8vIHNwZWNpZmljIGVsZW1lbnRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuaWdub3JlRnJvbSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmlnbm9yZUZyb207XG4gICAgICAgIH0sXG5cbiAgICAgICAgLypcXFxuICAgICAgICAgKiBJbnRlcmFjdGFibGUuYWxsb3dGcm9tXG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIEEgZHJhZy9yZXNpemUvZ2VzdHVyZSBpcyBzdGFydGVkIG9ubHkgSWYgdGhlIHRhcmdldCBvZiB0aGVcbiAgICAgICAgICogYG1vdXNlZG93bmAsIGBwb2ludGVyZG93bmAgb3IgYHRvdWNoc3RhcnRgIGV2ZW50IG9yIGFueSBvZiBpdCdzXG4gICAgICAgICAqIHBhcmVudHMgbWF0Y2ggdGhlIGdpdmVuIENTUyBzZWxlY3RvciBvciBFbGVtZW50LlxuICAgICAgICAgKlxuICAgICAgICAgLSBuZXdWYWx1ZSAoc3RyaW5nIHwgRWxlbWVudCB8IG51bGwpICNvcHRpb25hbCBhIENTUyBzZWxlY3RvciBzdHJpbmcsIGFuIEVsZW1lbnQgb3IgYG51bGxgIHRvIGFsbG93IGZyb20gYW55IGVsZW1lbnRcbiAgICAgICAgID0gKHN0cmluZyB8IEVsZW1lbnQgfCBvYmplY3QpIFRoZSBjdXJyZW50IGFsbG93RnJvbSB2YWx1ZSBvciB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKipcbiAgICAgICAgIHwgaW50ZXJhY3QoZWxlbWVudCwgeyBhbGxvd0Zyb206IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdkcmFnLWhhbmRsZScpIH0pO1xuICAgICAgICAgfCAvLyBvclxuICAgICAgICAgfCBpbnRlcmFjdChlbGVtZW50KS5hbGxvd0Zyb20oJy5oYW5kbGUnKTtcbiAgICAgICAgXFwqL1xuICAgICAgICBhbGxvd0Zyb206IGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICAgICAgaWYgKHRyeVNlbGVjdG9yKG5ld1ZhbHVlKSkgeyAgICAgICAgICAgIC8vIENTUyBzZWxlY3RvciB0byBtYXRjaCBldmVudC50YXJnZXRcbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnMuYWxsb3dGcm9tID0gbmV3VmFsdWU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0VsZW1lbnQobmV3VmFsdWUpKSB7ICAgICAgICAgICAgICAvLyBzcGVjaWZpYyBlbGVtZW50XG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zLmFsbG93RnJvbSA9IG5ld1ZhbHVlO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vcHRpb25zLmFsbG93RnJvbTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5lbGVtZW50XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIElmIHRoaXMgaXMgbm90IGEgc2VsZWN0b3IgSW50ZXJhY3RhYmxlLCBpdCByZXR1cm5zIHRoZSBlbGVtZW50IHRoaXNcbiAgICAgICAgICogaW50ZXJhY3RhYmxlIHJlcHJlc2VudHNcbiAgICAgICAgICpcbiAgICAgICAgID0gKEVsZW1lbnQpIEhUTUwgLyBTVkcgRWxlbWVudFxuICAgICAgICBcXCovXG4gICAgICAgIGVsZW1lbnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9lbGVtZW50O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLmZpcmVcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogQ2FsbHMgbGlzdGVuZXJzIGZvciB0aGUgZ2l2ZW4gSW50ZXJhY3RFdmVudCB0eXBlIGJvdW5kIGdsb2JhbGx5XG4gICAgICAgICAqIGFuZCBkaXJlY3RseSB0byB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgKlxuICAgICAgICAgLSBpRXZlbnQgKEludGVyYWN0RXZlbnQpIFRoZSBJbnRlcmFjdEV2ZW50IG9iamVjdCB0byBiZSBmaXJlZCBvbiB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICAgPSAoSW50ZXJhY3RhYmxlKSB0aGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIGZpcmU6IGZ1bmN0aW9uIChpRXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghKGlFdmVudCAmJiBpRXZlbnQudHlwZSkgfHwgIWNvbnRhaW5zKGV2ZW50VHlwZXMsIGlFdmVudC50eXBlKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbGlzdGVuZXJzLFxuICAgICAgICAgICAgICAgIGksXG4gICAgICAgICAgICAgICAgbGVuLFxuICAgICAgICAgICAgICAgIG9uRXZlbnQgPSAnb24nICsgaUV2ZW50LnR5cGUsXG4gICAgICAgICAgICAgICAgZnVuY05hbWUgPSAnJztcblxuICAgICAgICAgICAgLy8gSW50ZXJhY3RhYmxlI29uKCkgbGlzdGVuZXJzXG4gICAgICAgICAgICBpZiAoaUV2ZW50LnR5cGUgaW4gdGhpcy5faUV2ZW50cykge1xuICAgICAgICAgICAgICAgIGxpc3RlbmVycyA9IHRoaXMuX2lFdmVudHNbaUV2ZW50LnR5cGVdO1xuXG4gICAgICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDsgaSA8IGxlbiAmJiAhaUV2ZW50LmltbWVkaWF0ZVByb3BhZ2F0aW9uU3RvcHBlZDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIGZ1bmNOYW1lID0gbGlzdGVuZXJzW2ldLm5hbWU7XG4gICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyc1tpXShpRXZlbnQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaW50ZXJhY3RhYmxlLm9uZXZlbnQgbGlzdGVuZXJcbiAgICAgICAgICAgIGlmIChpc0Z1bmN0aW9uKHRoaXNbb25FdmVudF0pKSB7XG4gICAgICAgICAgICAgICAgZnVuY05hbWUgPSB0aGlzW29uRXZlbnRdLm5hbWU7XG4gICAgICAgICAgICAgICAgdGhpc1tvbkV2ZW50XShpRXZlbnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBpbnRlcmFjdC5vbigpIGxpc3RlbmVyc1xuICAgICAgICAgICAgaWYgKGlFdmVudC50eXBlIGluIGdsb2JhbEV2ZW50cyAmJiAobGlzdGVuZXJzID0gZ2xvYmFsRXZlbnRzW2lFdmVudC50eXBlXSkpICB7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwLCBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoOyBpIDwgbGVuICYmICFpRXZlbnQuaW1tZWRpYXRlUHJvcGFnYXRpb25TdG9wcGVkOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgZnVuY05hbWUgPSBsaXN0ZW5lcnNbaV0ubmFtZTtcbiAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzW2ldKGlFdmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5vblxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBCaW5kcyBhIGxpc3RlbmVyIGZvciBhbiBJbnRlcmFjdEV2ZW50IG9yIERPTSBldmVudC5cbiAgICAgICAgICpcbiAgICAgICAgIC0gZXZlbnRUeXBlICAoc3RyaW5nIHwgYXJyYXkgfCBvYmplY3QpIFRoZSB0eXBlcyBvZiBldmVudHMgdG8gbGlzdGVuIGZvclxuICAgICAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiB0aGUgZ2l2ZW4gZXZlbnQocylcbiAgICAgICAgIC0gdXNlQ2FwdHVyZSAoYm9vbGVhbikgI29wdGlvbmFsIHVzZUNhcHR1cmUgZmxhZyBmb3IgYWRkRXZlbnRMaXN0ZW5lclxuICAgICAgICAgPSAob2JqZWN0KSBUaGlzIEludGVyYWN0YWJsZVxuICAgICAgICBcXCovXG4gICAgICAgIG9uOiBmdW5jdGlvbiAoZXZlbnRUeXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICAgICAgdmFyIGk7XG5cbiAgICAgICAgICAgIGlmIChpc1N0cmluZyhldmVudFR5cGUpICYmIGV2ZW50VHlwZS5zZWFyY2goJyAnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBldmVudFR5cGUgPSBldmVudFR5cGUudHJpbSgpLnNwbGl0KC8gKy8pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNBcnJheShldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGV2ZW50VHlwZS5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLm9uKGV2ZW50VHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub24ocHJvcCwgZXZlbnRUeXBlW3Byb3BdLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChldmVudFR5cGUgPT09ICd3aGVlbCcpIHtcbiAgICAgICAgICAgICAgICBldmVudFR5cGUgPSB3aGVlbEV2ZW50O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBjb252ZXJ0IHRvIGJvb2xlYW5cbiAgICAgICAgICAgIHVzZUNhcHR1cmUgPSB1c2VDYXB0dXJlPyB0cnVlOiBmYWxzZTtcblxuICAgICAgICAgICAgaWYgKGNvbnRhaW5zKGV2ZW50VHlwZXMsIGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICAvLyBpZiB0aGlzIHR5cGUgb2YgZXZlbnQgd2FzIG5ldmVyIGJvdW5kIHRvIHRoaXMgSW50ZXJhY3RhYmxlXG4gICAgICAgICAgICAgICAgaWYgKCEoZXZlbnRUeXBlIGluIHRoaXMuX2lFdmVudHMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2lFdmVudHNbZXZlbnRUeXBlXSA9IFtsaXN0ZW5lcl07XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9pRXZlbnRzW2V2ZW50VHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZGVsZWdhdGVkIGV2ZW50IGZvciBzZWxlY3RvclxuICAgICAgICAgICAgZWxzZSBpZiAodGhpcy5zZWxlY3Rvcikge1xuICAgICAgICAgICAgICAgIGlmICghZGVsZWdhdGVkRXZlbnRzW2V2ZW50VHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkRXZlbnRzW2V2ZW50VHlwZV0gPSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBzZWxlY3RvcnM6IFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29udGV4dHMgOiBbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpc3RlbmVyczogW11cbiAgICAgICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBhZGQgZGVsZWdhdGUgbGlzdGVuZXIgZnVuY3Rpb25zXG4gICAgICAgICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBkb2N1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jdW1lbnRzW2ldLCBldmVudFR5cGUsIGRlbGVnYXRlTGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLmFkZChkb2N1bWVudHNbaV0sIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBkZWxlZ2F0ZWQgPSBkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSxcbiAgICAgICAgICAgICAgICAgICAgaW5kZXg7XG5cbiAgICAgICAgICAgICAgICBmb3IgKGluZGV4ID0gZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2luZGV4XSA9PT0gdGhpcy5zZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2luZGV4XSA9PT0gdGhpcy5fY29udGV4dCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICBpZiAoaW5kZXggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIGluZGV4ID0gZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGg7XG5cbiAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLnNlbGVjdG9ycy5wdXNoKHRoaXMuc2VsZWN0b3IpO1xuICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuY29udGV4dHMgLnB1c2godGhpcy5fY29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIGRlbGVnYXRlZC5saXN0ZW5lcnMucHVzaChbXSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8ga2VlcCBsaXN0ZW5lciBhbmQgdXNlQ2FwdHVyZSBmbGFnXG4gICAgICAgICAgICAgICAgZGVsZWdhdGVkLmxpc3RlbmVyc1tpbmRleF0ucHVzaChbbGlzdGVuZXIsIHVzZUNhcHR1cmVdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQodGhpcy5fZWxlbWVudCwgZXZlbnRUeXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLm9mZlxuICAgICAgICAgWyBtZXRob2QgXVxuICAgICAgICAgKlxuICAgICAgICAgKiBSZW1vdmVzIGFuIEludGVyYWN0RXZlbnQgb3IgRE9NIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgICAqXG4gICAgICAgICAtIGV2ZW50VHlwZSAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRoYXQgd2VyZSBsaXN0ZW5lZCBmb3JcbiAgICAgICAgIC0gbGlzdGVuZXIgICAoZnVuY3Rpb24pIFRoZSBsaXN0ZW5lciBmdW5jdGlvbiB0byBiZSByZW1vdmVkXG4gICAgICAgICAtIHVzZUNhcHR1cmUgKGJvb2xlYW4pICNvcHRpb25hbCB1c2VDYXB0dXJlIGZsYWcgZm9yIHJlbW92ZUV2ZW50TGlzdGVuZXJcbiAgICAgICAgID0gKG9iamVjdCkgVGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgXFwqL1xuICAgICAgICBvZmY6IGZ1bmN0aW9uIChldmVudFR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKSB7XG4gICAgICAgICAgICB2YXIgaTtcblxuICAgICAgICAgICAgaWYgKGlzU3RyaW5nKGV2ZW50VHlwZSkgJiYgZXZlbnRUeXBlLnNlYXJjaCgnICcpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgIGV2ZW50VHlwZSA9IGV2ZW50VHlwZS50cmltKCkuc3BsaXQoLyArLyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChpc0FycmF5KGV2ZW50VHlwZSkpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXZlbnRUeXBlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub2ZmKGV2ZW50VHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoaXNPYmplY3QoZXZlbnRUeXBlKSkge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMub2ZmKHByb3AsIGV2ZW50VHlwZVtwcm9wXSwgbGlzdGVuZXIpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZXZlbnRMaXN0LFxuICAgICAgICAgICAgICAgIGluZGV4ID0gLTE7XG5cbiAgICAgICAgICAgIC8vIGNvbnZlcnQgdG8gYm9vbGVhblxuICAgICAgICAgICAgdXNlQ2FwdHVyZSA9IHVzZUNhcHR1cmU/IHRydWU6IGZhbHNlO1xuXG4gICAgICAgICAgICBpZiAoZXZlbnRUeXBlID09PSAnd2hlZWwnKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRUeXBlID0gd2hlZWxFdmVudDtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gaWYgaXQgaXMgYW4gYWN0aW9uIGV2ZW50IHR5cGVcbiAgICAgICAgICAgIGlmIChjb250YWlucyhldmVudFR5cGVzLCBldmVudFR5cGUpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRMaXN0ID0gdGhpcy5faUV2ZW50c1tldmVudFR5cGVdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGV2ZW50TGlzdCAmJiAoaW5kZXggPSBpbmRleE9mKGV2ZW50TGlzdCwgbGlzdGVuZXIpKSAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faUV2ZW50c1tldmVudFR5cGVdLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gZGVsZWdhdGVkIGV2ZW50XG4gICAgICAgICAgICBlbHNlIGlmICh0aGlzLnNlbGVjdG9yKSB7XG4gICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1tldmVudFR5cGVdLFxuICAgICAgICAgICAgICAgICAgICBtYXRjaEZvdW5kID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICBpZiAoIWRlbGVnYXRlZCkgeyByZXR1cm4gdGhpczsgfVxuXG4gICAgICAgICAgICAgICAgLy8gY291bnQgZnJvbSBsYXN0IGluZGV4IG9mIGRlbGVnYXRlZCB0byAwXG4gICAgICAgICAgICAgICAgZm9yIChpbmRleCA9IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoIC0gMTsgaW5kZXggPj0gMDsgaW5kZXgtLSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBsb29rIGZvciBtYXRjaGluZyBzZWxlY3RvciBhbmQgY29udGV4dCBOb2RlXG4gICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2luZGV4XSA9PT0gdGhpcy5zZWxlY3RvclxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2luZGV4XSA9PT0gdGhpcy5fY29udGV4dCkge1xuXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgbGlzdGVuZXJzID0gZGVsZWdhdGVkLmxpc3RlbmVyc1tpbmRleF07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGVhY2ggaXRlbSBvZiB0aGUgbGlzdGVuZXJzIGFycmF5IGlzIGFuIGFycmF5OiBbZnVuY3Rpb24sIHVzZUNhcHR1cmVGbGFnXVxuICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChpID0gbGlzdGVuZXJzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gbGlzdGVuZXJzW2ldWzBdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB1c2VDYXAgPSBsaXN0ZW5lcnNbaV1bMV07XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjaGVjayBpZiB0aGUgbGlzdGVuZXIgZnVuY3Rpb25zIGFuZCB1c2VDYXB0dXJlIGZsYWdzIG1hdGNoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZuID09PSBsaXN0ZW5lciAmJiB1c2VDYXAgPT09IHVzZUNhcHR1cmUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBsaXN0ZW5lciBmcm9tIHRoZSBhcnJheSBvZiBsaXN0ZW5lcnNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGlzdGVuZXJzLnNwbGljZShpLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiBhbGwgbGlzdGVuZXJzIGZvciB0aGlzIGludGVyYWN0YWJsZSBoYXZlIGJlZW4gcmVtb3ZlZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgdGhlIGludGVyYWN0YWJsZSBmcm9tIHRoZSBkZWxlZ2F0ZWQgYXJyYXlzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbGlzdGVuZXJzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLnNlbGVjdG9ycy5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLmNvbnRleHRzIC5zcGxpY2UoaW5kZXgsIDEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZWdhdGVkLmxpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyByZW1vdmUgZGVsZWdhdGUgZnVuY3Rpb24gZnJvbSBjb250ZXh0XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2NvbnRleHQsIGV2ZW50VHlwZSwgZGVsZWdhdGVMaXN0ZW5lcik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2NvbnRleHQsIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVtb3ZlIHRoZSBhcnJheXMgaWYgdGhleSBhcmUgZW1wdHlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICghZGVsZWdhdGVkLnNlbGVjdG9ycy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHNbZXZlbnRUeXBlXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBvbmx5IHJlbW92ZSBvbmUgbGlzdGVuZXJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbWF0Y2hGb3VuZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hdGNoRm91bmQpIHsgYnJlYWs7IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHJlbW92ZSBsaXN0ZW5lciBmcm9tIHRoaXMgSW50ZXJhdGFibGUncyBlbGVtZW50XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBldmVudHMucmVtb3ZlKHRoaXMuX2VsZW1lbnQsIGV2ZW50VHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKlxcXG4gICAgICAgICAqIEludGVyYWN0YWJsZS5zZXRcbiAgICAgICAgIFsgbWV0aG9kIF1cbiAgICAgICAgICpcbiAgICAgICAgICogUmVzZXQgdGhlIG9wdGlvbnMgb2YgdGhpcyBJbnRlcmFjdGFibGVcbiAgICAgICAgIC0gb3B0aW9ucyAob2JqZWN0KSBUaGUgbmV3IHNldHRpbmdzIHRvIGFwcGx5XG4gICAgICAgICA9IChvYmplY3QpIFRoaXMgSW50ZXJhY3RhYmx3XG4gICAgICAgIFxcKi9cbiAgICAgICAgc2V0OiBmdW5jdGlvbiAob3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKCFpc09iamVjdChvcHRpb25zKSkge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSB7fTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5vcHRpb25zID0gZXh0ZW5kKHt9LCBkZWZhdWx0T3B0aW9ucy5iYXNlKTtcblxuICAgICAgICAgICAgdmFyIGksXG4gICAgICAgICAgICAgICAgYWN0aW9ucyA9IFsnZHJhZycsICdkcm9wJywgJ3Jlc2l6ZScsICdnZXN0dXJlJ10sXG4gICAgICAgICAgICAgICAgbWV0aG9kcyA9IFsnZHJhZ2dhYmxlJywgJ2Ryb3B6b25lJywgJ3Jlc2l6YWJsZScsICdnZXN0dXJhYmxlJ10sXG4gICAgICAgICAgICAgICAgcGVyQWN0aW9ucyA9IGV4dGVuZChleHRlbmQoe30sIGRlZmF1bHRPcHRpb25zLnBlckFjdGlvbiksIG9wdGlvbnNbYWN0aW9uXSB8fCB7fSk7XG5cbiAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGFjdGlvbiA9IGFjdGlvbnNbaV07XG5cbiAgICAgICAgICAgICAgICB0aGlzLm9wdGlvbnNbYWN0aW9uXSA9IGV4dGVuZCh7fSwgZGVmYXVsdE9wdGlvbnNbYWN0aW9uXSk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLnNldFBlckFjdGlvbihhY3Rpb24sIHBlckFjdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgdGhpc1ttZXRob2RzW2ldXShvcHRpb25zW2FjdGlvbl0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgc2V0dGluZ3MgPSBbXG4gICAgICAgICAgICAgICAgICAgICdhY2NlcHQnLCAnYWN0aW9uQ2hlY2tlcicsICdhbGxvd0Zyb20nLCAnZGVsdGFTb3VyY2UnLFxuICAgICAgICAgICAgICAgICAgICAnZHJvcENoZWNrZXInLCAnaWdub3JlRnJvbScsICdvcmlnaW4nLCAncHJldmVudERlZmF1bHQnLFxuICAgICAgICAgICAgICAgICAgICAncmVjdENoZWNrZXInXG4gICAgICAgICAgICAgICAgXTtcblxuICAgICAgICAgICAgZm9yIChpID0gMCwgbGVuID0gc2V0dGluZ3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgc2V0dGluZyA9IHNldHRpbmdzW2ldO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5vcHRpb25zW3NldHRpbmddID0gZGVmYXVsdE9wdGlvbnMuYmFzZVtzZXR0aW5nXTtcblxuICAgICAgICAgICAgICAgIGlmIChzZXR0aW5nIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpc1tzZXR0aW5nXShvcHRpb25zW3NldHRpbmddKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qXFxcbiAgICAgICAgICogSW50ZXJhY3RhYmxlLnVuc2V0XG4gICAgICAgICBbIG1ldGhvZCBdXG4gICAgICAgICAqXG4gICAgICAgICAqIFJlbW92ZSB0aGlzIGludGVyYWN0YWJsZSBmcm9tIHRoZSBsaXN0IG9mIGludGVyYWN0YWJsZXMgYW5kIHJlbW92ZVxuICAgICAgICAgKiBpdCdzIGRyYWcsIGRyb3AsIHJlc2l6ZSBhbmQgZ2VzdHVyZSBjYXBhYmlsaXRpZXNcbiAgICAgICAgICpcbiAgICAgICAgID0gKG9iamVjdCkgQGludGVyYWN0XG4gICAgICAgIFxcKi9cbiAgICAgICAgdW5zZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcywgJ2FsbCcpO1xuXG4gICAgICAgICAgICBpZiAoIWlzU3RyaW5nKHRoaXMuc2VsZWN0b3IpKSB7XG4gICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLCAnYWxsJyk7XG4gICAgICAgICAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5zdHlsZUN1cnNvcikge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9lbGVtZW50LnN0eWxlLmN1cnNvciA9ICcnO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIHJlbW92ZSBkZWxlZ2F0ZWQgZXZlbnRzXG4gICAgICAgICAgICAgICAgZm9yICh2YXIgdHlwZSBpbiBkZWxlZ2F0ZWRFdmVudHMpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlbGVnYXRlZCA9IGRlbGVnYXRlZEV2ZW50c1t0eXBlXTtcblxuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGRlbGVnYXRlZC5zZWxlY3RvcnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkZWxlZ2F0ZWQuc2VsZWN0b3JzW2ldID09PSB0aGlzLnNlbGVjdG9yXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgZGVsZWdhdGVkLmNvbnRleHRzW2ldID09PSB0aGlzLl9jb250ZXh0KSB7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuc2VsZWN0b3JzLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQuY29udGV4dHMgLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWQubGlzdGVuZXJzLnNwbGljZShpLCAxKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJlbW92ZSB0aGUgYXJyYXlzIGlmIHRoZXkgYXJlIGVtcHR5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFkZWxlZ2F0ZWQuc2VsZWN0b3JzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHNbdHlwZV0gPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnRzLnJlbW92ZSh0aGlzLl9jb250ZXh0LCB0eXBlLCBkZWxlZ2F0ZUxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUodGhpcy5fY29udGV4dCwgdHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZHJvcHpvbmUoZmFsc2UpO1xuXG4gICAgICAgICAgICBpbnRlcmFjdGFibGVzLnNwbGljZShpbmRleE9mKGludGVyYWN0YWJsZXMsIHRoaXMpLCAxKTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHdhcm5PbmNlIChtZXRob2QsIG1lc3NhZ2UpIHtcbiAgICAgICAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgICAgICAgICAgIHdpbmRvdy5jb25zb2xlLndhcm4obWVzc2FnZSk7XG4gICAgICAgICAgICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIG1ldGhvZC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuc25hcCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuc25hcCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjc25hcCBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBzbmFwcGluZyBhdCBodHRwOi8vaW50ZXJhY3Rqcy5pby9kb2NzL3NuYXBwaW5nJyk7XG4gICAgSW50ZXJhY3RhYmxlLnByb3RvdHlwZS5yZXN0cmljdCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUucmVzdHJpY3QsXG4gICAgICAgICAnSW50ZXJhY3RhYmxlI3Jlc3RyaWN0IGlzIGRlcHJlY2F0ZWQuIFNlZSB0aGUgbmV3IGRvY3VtZW50YXRpb24gZm9yIHJlc3RpY3RpbmcgYXQgaHR0cDovL2ludGVyYWN0anMuaW8vZG9jcy9yZXN0cmljdGlvbicpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuaW5lcnRpYSA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuaW5lcnRpYSxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjaW5lcnRpYSBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBpbmVydGlhIGF0IGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3MvaW5lcnRpYScpO1xuICAgIEludGVyYWN0YWJsZS5wcm90b3R5cGUuYXV0b1Njcm9sbCA9IHdhcm5PbmNlKEludGVyYWN0YWJsZS5wcm90b3R5cGUuYXV0b1Njcm9sbCxcbiAgICAgICAgICdJbnRlcmFjdGFibGUjYXV0b1Njcm9sbCBpcyBkZXByZWNhdGVkLiBTZWUgdGhlIG5ldyBkb2N1bWVudGF0aW9uIGZvciBhdXRvU2Nyb2xsIGF0IGh0dHA6Ly9pbnRlcmFjdGpzLmlvL2RvY3MvI2F1dG9zY3JvbGwnKTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5pc1NldFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBDaGVjayBpZiBhbiBlbGVtZW50IGhhcyBiZWVuIHNldFxuICAgICAtIGVsZW1lbnQgKEVsZW1lbnQpIFRoZSBFbGVtZW50IGJlaW5nIHNlYXJjaGVkIGZvclxuICAgICA9IChib29sZWFuKSBJbmRpY2F0ZXMgaWYgdGhlIGVsZW1lbnQgb3IgQ1NTIHNlbGVjdG9yIHdhcyBwcmV2aW91c2x5IHBhc3NlZCB0byBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5pc1NldCA9IGZ1bmN0aW9uKGVsZW1lbnQsIG9wdGlvbnMpIHtcbiAgICAgICAgcmV0dXJuIGludGVyYWN0YWJsZXMuaW5kZXhPZkVsZW1lbnQoZWxlbWVudCwgb3B0aW9ucyAmJiBvcHRpb25zLmNvbnRleHQpICE9PSAtMTtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm9uXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIEFkZHMgYSBnbG9iYWwgbGlzdGVuZXIgZm9yIGFuIEludGVyYWN0RXZlbnQgb3IgYWRkcyBhIERPTSBldmVudCB0b1xuICAgICAqIGBkb2N1bWVudGBcbiAgICAgKlxuICAgICAtIHR5cGUgICAgICAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRvIGxpc3RlbiBmb3JcbiAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiB0aGUgZ2l2ZW4gZXZlbnQocylcbiAgICAgLSB1c2VDYXB0dXJlIChib29sZWFuKSAjb3B0aW9uYWwgdXNlQ2FwdHVyZSBmbGFnIGZvciBhZGRFdmVudExpc3RlbmVyXG4gICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3Qub24gPSBmdW5jdGlvbiAodHlwZSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpIHtcbiAgICAgICAgaWYgKGlzU3RyaW5nKHR5cGUpICYmIHR5cGUuc2VhcmNoKCcgJykgIT09IC0xKSB7XG4gICAgICAgICAgICB0eXBlID0gdHlwZS50cmltKCkuc3BsaXQoLyArLyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNBcnJheSh0eXBlKSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0eXBlLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaW50ZXJhY3Qub24odHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gdHlwZSkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0Lm9uKHByb3AsIHR5cGVbcHJvcF0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgaXQgaXMgYW4gSW50ZXJhY3RFdmVudCB0eXBlLCBhZGQgbGlzdGVuZXIgdG8gZ2xvYmFsRXZlbnRzXG4gICAgICAgIGlmIChjb250YWlucyhldmVudFR5cGVzLCB0eXBlKSkge1xuICAgICAgICAgICAgLy8gaWYgdGhpcyB0eXBlIG9mIGV2ZW50IHdhcyBuZXZlciBib3VuZFxuICAgICAgICAgICAgaWYgKCFnbG9iYWxFdmVudHNbdHlwZV0pIHtcbiAgICAgICAgICAgICAgICBnbG9iYWxFdmVudHNbdHlwZV0gPSBbbGlzdGVuZXJdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIElmIG5vbiBJbnRlcmFjdEV2ZW50IHR5cGUsIGFkZEV2ZW50TGlzdGVuZXIgdG8gZG9jdW1lbnRcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvY3VtZW50LCB0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5vZmZcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogUmVtb3ZlcyBhIGdsb2JhbCBJbnRlcmFjdEV2ZW50IGxpc3RlbmVyIG9yIERPTSBldmVudCBmcm9tIGBkb2N1bWVudGBcbiAgICAgKlxuICAgICAtIHR5cGUgICAgICAgKHN0cmluZyB8IGFycmF5IHwgb2JqZWN0KSBUaGUgdHlwZXMgb2YgZXZlbnRzIHRoYXQgd2VyZSBsaXN0ZW5lZCBmb3JcbiAgICAgLSBsaXN0ZW5lciAgIChmdW5jdGlvbikgVGhlIGxpc3RlbmVyIGZ1bmN0aW9uIHRvIGJlIHJlbW92ZWRcbiAgICAgLSB1c2VDYXB0dXJlIChib29sZWFuKSAjb3B0aW9uYWwgdXNlQ2FwdHVyZSBmbGFnIGZvciByZW1vdmVFdmVudExpc3RlbmVyXG4gICAgID0gKG9iamVjdCkgaW50ZXJhY3RcbiAgICAgXFwqL1xuICAgIGludGVyYWN0Lm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBsaXN0ZW5lciwgdXNlQ2FwdHVyZSkge1xuICAgICAgICBpZiAoaXNTdHJpbmcodHlwZSkgJiYgdHlwZS5zZWFyY2goJyAnKSAhPT0gLTEpIHtcbiAgICAgICAgICAgIHR5cGUgPSB0eXBlLnRyaW0oKS5zcGxpdCgvICsvKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChpc0FycmF5KHR5cGUpKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHR5cGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpbnRlcmFjdC5vZmYodHlwZVtpXSwgbGlzdGVuZXIsIHVzZUNhcHR1cmUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNPYmplY3QodHlwZSkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3AgaW4gdHlwZSkge1xuICAgICAgICAgICAgICAgIGludGVyYWN0Lm9mZihwcm9wLCB0eXBlW3Byb3BdLCBsaXN0ZW5lcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY29udGFpbnMoZXZlbnRUeXBlcywgdHlwZSkpIHtcbiAgICAgICAgICAgIGV2ZW50cy5yZW1vdmUoZG9jdW1lbnQsIHR5cGUsIGxpc3RlbmVyLCB1c2VDYXB0dXJlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHZhciBpbmRleDtcblxuICAgICAgICAgICAgaWYgKHR5cGUgaW4gZ2xvYmFsRXZlbnRzXG4gICAgICAgICAgICAgICAgJiYgKGluZGV4ID0gaW5kZXhPZihnbG9iYWxFdmVudHNbdHlwZV0sIGxpc3RlbmVyKSkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgZ2xvYmFsRXZlbnRzW3R5cGVdLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5lbmFibGVEcmFnZ2luZ1xuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBEZXByZWNhdGVkLlxuICAgICAqXG4gICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZHJhZ2dpbmcgaXMgZW5hYmxlZCBmb3IgYW55IEludGVyYWN0YWJsZXNcbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChib29sZWFuKSAjb3B0aW9uYWwgYHRydWVgIHRvIGFsbG93IHRoZSBhY3Rpb247IGBmYWxzZWAgdG8gZGlzYWJsZSBhY3Rpb24gZm9yIGFsbCBJbnRlcmFjdGFibGVzXG4gICAgID0gKGJvb2xlYW4gfCBvYmplY3QpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZW5hYmxlRHJhZ2dpbmcgPSB3YXJuT25jZShmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKG5ld1ZhbHVlICE9PSBudWxsICYmIG5ld1ZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGFjdGlvbklzRW5hYmxlZC5kcmFnID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gYWN0aW9uSXNFbmFibGVkLmRyYWc7XG4gICAgfSwgJ2ludGVyYWN0LmVuYWJsZURyYWdnaW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmVuYWJsZVJlc2l6aW5nXG4gICAgIFsgbWV0aG9kIF1cbiAgICAgKlxuICAgICAqIERlcHJlY2F0ZWQuXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciByZXNpemluZyBpcyBlbmFibGVkIGZvciBhbnkgSW50ZXJhY3RhYmxlc1xuICAgICAqXG4gICAgIC0gbmV3VmFsdWUgKGJvb2xlYW4pICNvcHRpb25hbCBgdHJ1ZWAgdG8gYWxsb3cgdGhlIGFjdGlvbjsgYGZhbHNlYCB0byBkaXNhYmxlIGFjdGlvbiBmb3IgYWxsIEludGVyYWN0YWJsZXNcbiAgICAgPSAoYm9vbGVhbiB8IG9iamVjdCkgVGhlIGN1cnJlbnQgc2V0dGluZyBvciBpbnRlcmFjdFxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5lbmFibGVSZXNpemluZyA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG51bGwgJiYgbmV3VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYWN0aW9uSXNFbmFibGVkLnJlc2l6ZSA9IG5ld1ZhbHVlO1xuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFjdGlvbklzRW5hYmxlZC5yZXNpemU7XG4gICAgfSwgJ2ludGVyYWN0LmVuYWJsZVJlc2l6aW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LmVuYWJsZUdlc3R1cmluZ1xuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBEZXByZWNhdGVkLlxuICAgICAqXG4gICAgICogUmV0dXJucyBvciBzZXRzIHdoZXRoZXIgZ2VzdHVyaW5nIGlzIGVuYWJsZWQgZm9yIGFueSBJbnRlcmFjdGFibGVzXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsIGB0cnVlYCB0byBhbGxvdyB0aGUgYWN0aW9uOyBgZmFsc2VgIHRvIGRpc2FibGUgYWN0aW9uIGZvciBhbGwgSW50ZXJhY3RhYmxlc1xuICAgICA9IChib29sZWFuIHwgb2JqZWN0KSBUaGUgY3VycmVudCBzZXR0aW5nIG9yIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LmVuYWJsZUdlc3R1cmluZyA9IHdhcm5PbmNlKGZ1bmN0aW9uIChuZXdWYWx1ZSkge1xuICAgICAgICBpZiAobmV3VmFsdWUgIT09IG51bGwgJiYgbmV3VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgYWN0aW9uSXNFbmFibGVkLmdlc3R1cmUgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBhY3Rpb25Jc0VuYWJsZWQuZ2VzdHVyZTtcbiAgICB9LCAnaW50ZXJhY3QuZW5hYmxlR2VzdHVyaW5nIGlzIGRlcHJlY2F0ZWQgYW5kIHdpbGwgc29vbiBiZSByZW1vdmVkLicpO1xuXG4gICAgaW50ZXJhY3QuZXZlbnRUeXBlcyA9IGV2ZW50VHlwZXM7XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3QuZGVidWdcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogUmV0dXJucyBkZWJ1Z2dpbmcgZGF0YVxuICAgICA9IChvYmplY3QpIEFuIG9iamVjdCB3aXRoIHByb3BlcnRpZXMgdGhhdCBvdXRsaW5lIHRoZSBjdXJyZW50IHN0YXRlIGFuZCBleHBvc2UgaW50ZXJuYWwgZnVuY3Rpb25zIGFuZCB2YXJpYWJsZXNcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZGVidWcgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBpbnRlcmFjdGlvbiA9IGludGVyYWN0aW9uc1swXSB8fCBuZXcgSW50ZXJhY3Rpb24oKTtcblxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaW50ZXJhY3Rpb25zICAgICAgICAgIDogaW50ZXJhY3Rpb25zLFxuICAgICAgICAgICAgdGFyZ2V0ICAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24udGFyZ2V0LFxuICAgICAgICAgICAgZHJhZ2dpbmcgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24uZHJhZ2dpbmcsXG4gICAgICAgICAgICByZXNpemluZyAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5yZXNpemluZyxcbiAgICAgICAgICAgIGdlc3R1cmluZyAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmdlc3R1cmluZyxcbiAgICAgICAgICAgIHByZXBhcmVkICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnByZXBhcmVkLFxuICAgICAgICAgICAgbWF0Y2hlcyAgICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ubWF0Y2hlcyxcbiAgICAgICAgICAgIG1hdGNoRWxlbWVudHMgICAgICAgICA6IGludGVyYWN0aW9uLm1hdGNoRWxlbWVudHMsXG5cbiAgICAgICAgICAgIHByZXZDb29yZHMgICAgICAgICAgICA6IGludGVyYWN0aW9uLnByZXZDb29yZHMsXG4gICAgICAgICAgICBzdGFydENvb3JkcyAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5zdGFydENvb3JkcyxcblxuICAgICAgICAgICAgcG9pbnRlcklkcyAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucG9pbnRlcklkcyxcbiAgICAgICAgICAgIHBvaW50ZXJzICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnBvaW50ZXJzLFxuICAgICAgICAgICAgYWRkUG9pbnRlciAgICAgICAgICAgIDogbGlzdGVuZXJzLmFkZFBvaW50ZXIsXG4gICAgICAgICAgICByZW1vdmVQb2ludGVyICAgICAgICAgOiBsaXN0ZW5lcnMucmVtb3ZlUG9pbnRlcixcbiAgICAgICAgICAgIHJlY29yZFBvaW50ZXIgICAgICAgIDogbGlzdGVuZXJzLnJlY29yZFBvaW50ZXIsXG5cbiAgICAgICAgICAgIHNuYXAgICAgICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLnNuYXBTdGF0dXMsXG4gICAgICAgICAgICByZXN0cmljdCAgICAgICAgICAgICAgOiBpbnRlcmFjdGlvbi5yZXN0cmljdFN0YXR1cyxcbiAgICAgICAgICAgIGluZXJ0aWEgICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmluZXJ0aWFTdGF0dXMsXG5cbiAgICAgICAgICAgIGRvd25UaW1lICAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25UaW1lc1swXSxcbiAgICAgICAgICAgIGRvd25FdmVudCAgICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25FdmVudCxcbiAgICAgICAgICAgIGRvd25Qb2ludGVyICAgICAgICAgICA6IGludGVyYWN0aW9uLmRvd25Qb2ludGVyLFxuICAgICAgICAgICAgcHJldkV2ZW50ICAgICAgICAgICAgIDogaW50ZXJhY3Rpb24ucHJldkV2ZW50LFxuXG4gICAgICAgICAgICBJbnRlcmFjdGFibGUgICAgICAgICAgOiBJbnRlcmFjdGFibGUsXG4gICAgICAgICAgICBpbnRlcmFjdGFibGVzICAgICAgICAgOiBpbnRlcmFjdGFibGVzLFxuICAgICAgICAgICAgcG9pbnRlcklzRG93biAgICAgICAgIDogaW50ZXJhY3Rpb24ucG9pbnRlcklzRG93bixcbiAgICAgICAgICAgIGRlZmF1bHRPcHRpb25zICAgICAgICA6IGRlZmF1bHRPcHRpb25zLFxuICAgICAgICAgICAgZGVmYXVsdEFjdGlvbkNoZWNrZXIgIDogZGVmYXVsdEFjdGlvbkNoZWNrZXIsXG5cbiAgICAgICAgICAgIGFjdGlvbkN1cnNvcnMgICAgICAgICA6IGFjdGlvbkN1cnNvcnMsXG4gICAgICAgICAgICBkcmFnTW92ZSAgICAgICAgICAgICAgOiBsaXN0ZW5lcnMuZHJhZ01vdmUsXG4gICAgICAgICAgICByZXNpemVNb3ZlICAgICAgICAgICAgOiBsaXN0ZW5lcnMucmVzaXplTW92ZSxcbiAgICAgICAgICAgIGdlc3R1cmVNb3ZlICAgICAgICAgICA6IGxpc3RlbmVycy5nZXN0dXJlTW92ZSxcbiAgICAgICAgICAgIHBvaW50ZXJVcCAgICAgICAgICAgICA6IGxpc3RlbmVycy5wb2ludGVyVXAsXG4gICAgICAgICAgICBwb2ludGVyRG93biAgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlckRvd24sXG4gICAgICAgICAgICBwb2ludGVyTW92ZSAgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlck1vdmUsXG4gICAgICAgICAgICBwb2ludGVySG92ZXIgICAgICAgICAgOiBsaXN0ZW5lcnMucG9pbnRlckhvdmVyLFxuXG4gICAgICAgICAgICBldmVudHMgICAgICAgICAgICAgICAgOiBldmVudHMsXG4gICAgICAgICAgICBnbG9iYWxFdmVudHMgICAgICAgICAgOiBnbG9iYWxFdmVudHMsXG4gICAgICAgICAgICBkZWxlZ2F0ZWRFdmVudHMgICAgICAgOiBkZWxlZ2F0ZWRFdmVudHNcbiAgICAgICAgfTtcbiAgICB9O1xuXG4gICAgLy8gZXhwb3NlIHRoZSBmdW5jdGlvbnMgdXNlZCB0byBjYWxjdWxhdGUgbXVsdGktdG91Y2ggcHJvcGVydGllc1xuICAgIGludGVyYWN0LmdldFRvdWNoQXZlcmFnZSAgPSB0b3VjaEF2ZXJhZ2U7XG4gICAgaW50ZXJhY3QuZ2V0VG91Y2hCQm94ICAgICA9IHRvdWNoQkJveDtcbiAgICBpbnRlcmFjdC5nZXRUb3VjaERpc3RhbmNlID0gdG91Y2hEaXN0YW5jZTtcbiAgICBpbnRlcmFjdC5nZXRUb3VjaEFuZ2xlICAgID0gdG91Y2hBbmdsZTtcblxuICAgIGludGVyYWN0LmdldEVsZW1lbnRSZWN0ICAgPSBnZXRFbGVtZW50UmVjdDtcbiAgICBpbnRlcmFjdC5tYXRjaGVzU2VsZWN0b3IgID0gbWF0Y2hlc1NlbGVjdG9yO1xuICAgIGludGVyYWN0LmNsb3Nlc3QgICAgICAgICAgPSBjbG9zZXN0O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0Lm1hcmdpblxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgdGhlIG1hcmdpbiBmb3IgYXV0b2NoZWNrIHJlc2l6aW5nIHVzZWQgaW5cbiAgICAgKiBASW50ZXJhY3RhYmxlLmdldEFjdGlvbi4gVGhhdCBpcyB0aGUgZGlzdGFuY2UgZnJvbSB0aGUgYm90dG9tIGFuZCByaWdodFxuICAgICAqIGVkZ2VzIG9mIGFuIGVsZW1lbnQgY2xpY2tpbmcgaW4gd2hpY2ggd2lsbCBzdGFydCByZXNpemluZ1xuICAgICAqXG4gICAgIC0gbmV3VmFsdWUgKG51bWJlcikgI29wdGlvbmFsXG4gICAgID0gKG51bWJlciB8IGludGVyYWN0KSBUaGUgY3VycmVudCBtYXJnaW4gdmFsdWUgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QubWFyZ2luID0gZnVuY3Rpb24gKG5ld3ZhbHVlKSB7XG4gICAgICAgIGlmIChpc051bWJlcihuZXd2YWx1ZSkpIHtcbiAgICAgICAgICAgIG1hcmdpbiA9IG5ld3ZhbHVlO1xuXG4gICAgICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIG1hcmdpbjtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LnN1cHBvcnRzVG91Y2hcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgID0gKGJvb2xlYW4pIFdoZXRoZXIgb3Igbm90IHRoZSBicm93c2VyIHN1cHBvcnRzIHRvdWNoIGlucHV0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LnN1cHBvcnRzVG91Y2ggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzdXBwb3J0c1RvdWNoO1xuICAgIH07XG5cbiAgICAvKlxcXG4gICAgICogaW50ZXJhY3Quc3VwcG9ydHNQb2ludGVyRXZlbnRcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgID0gKGJvb2xlYW4pIFdoZXRoZXIgb3Igbm90IHRoZSBicm93c2VyIHN1cHBvcnRzIFBvaW50ZXJFdmVudHNcbiAgICBcXCovXG4gICAgaW50ZXJhY3Quc3VwcG9ydHNQb2ludGVyRXZlbnQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiBzdXBwb3J0c1BvaW50ZXJFdmVudDtcbiAgICB9O1xuXG4gICAgLypcXFxuICAgICAqIGludGVyYWN0LnN0b3BcbiAgICAgWyBtZXRob2QgXVxuICAgICAqXG4gICAgICogQ2FuY2VscyBhbGwgaW50ZXJhY3Rpb25zIChlbmQgZXZlbnRzIGFyZSBub3QgZmlyZWQpXG4gICAgICpcbiAgICAgLSBldmVudCAoRXZlbnQpIEFuIGV2ZW50IG9uIHdoaWNoIHRvIGNhbGwgcHJldmVudERlZmF1bHQoKVxuICAgICA9IChvYmplY3QpIGludGVyYWN0XG4gICAgXFwqL1xuICAgIGludGVyYWN0LnN0b3AgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IGludGVyYWN0aW9ucy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgICAgICAgICBpbnRlcmFjdGlvbnNbaV0uc3RvcChldmVudCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gaW50ZXJhY3Q7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5keW5hbWljRHJvcFxuICAgICBbIG1ldGhvZCBdXG4gICAgICpcbiAgICAgKiBSZXR1cm5zIG9yIHNldHMgd2hldGhlciB0aGUgZGltZW5zaW9ucyBvZiBkcm9wem9uZSBlbGVtZW50cyBhcmVcbiAgICAgKiBjYWxjdWxhdGVkIG9uIGV2ZXJ5IGRyYWdtb3ZlIG9yIG9ubHkgb24gZHJhZ3N0YXJ0IGZvciB0aGUgZGVmYXVsdFxuICAgICAqIGRyb3BDaGVja2VyXG4gICAgICpcbiAgICAgLSBuZXdWYWx1ZSAoYm9vbGVhbikgI29wdGlvbmFsIFRydWUgdG8gY2hlY2sgb24gZWFjaCBtb3ZlLiBGYWxzZSB0byBjaGVjayBvbmx5IGJlZm9yZSBzdGFydFxuICAgICA9IChib29sZWFuIHwgaW50ZXJhY3QpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QuZHluYW1pY0Ryb3AgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzQm9vbChuZXdWYWx1ZSkpIHtcbiAgICAgICAgICAgIC8vaWYgKGRyYWdnaW5nICYmIGR5bmFtaWNEcm9wICE9PSBuZXdWYWx1ZSAmJiAhbmV3VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAvL2NhbGNSZWN0cyhkcm9wem9uZXMpO1xuICAgICAgICAgICAgLy99XG5cbiAgICAgICAgICAgIGR5bmFtaWNEcm9wID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiBpbnRlcmFjdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gZHluYW1pY0Ryb3A7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5wb2ludGVyTW92ZVRvbGVyYW5jZVxuICAgICBbIG1ldGhvZCBdXG4gICAgICogUmV0dXJucyBvciBzZXRzIHRoZSBkaXN0YW5jZSB0aGUgcG9pbnRlciBtdXN0IGJlIG1vdmVkIGJlZm9yZSBhbiBhY3Rpb25cbiAgICAgKiBzZXF1ZW5jZSBvY2N1cnMuIFRoaXMgYWxzbyBhZmZlY3RzIHRvbGVyYW5jZSBmb3IgdGFwIGV2ZW50cy5cbiAgICAgKlxuICAgICAtIG5ld1ZhbHVlIChudW1iZXIpICNvcHRpb25hbCBUaGUgbW92ZW1lbnQgZnJvbSB0aGUgc3RhcnQgcG9zaXRpb24gbXVzdCBiZSBncmVhdGVyIHRoYW4gdGhpcyB2YWx1ZVxuICAgICA9IChudW1iZXIgfCBJbnRlcmFjdGFibGUpIFRoZSBjdXJyZW50IHNldHRpbmcgb3IgaW50ZXJhY3RcbiAgICBcXCovXG4gICAgaW50ZXJhY3QucG9pbnRlck1vdmVUb2xlcmFuY2UgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzTnVtYmVyKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgcG9pbnRlck1vdmVUb2xlcmFuY2UgPSBuZXdWYWx1ZTtcblxuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcG9pbnRlck1vdmVUb2xlcmFuY2U7XG4gICAgfTtcblxuICAgIC8qXFxcbiAgICAgKiBpbnRlcmFjdC5tYXhJbnRlcmFjdGlvbnNcbiAgICAgWyBtZXRob2QgXVxuICAgICAqKlxuICAgICAqIFJldHVybnMgb3Igc2V0cyB0aGUgbWF4aW11bSBudW1iZXIgb2YgY29uY3VycmVudCBpbnRlcmFjdGlvbnMgYWxsb3dlZC5cbiAgICAgKiBCeSBkZWZhdWx0IG9ubHkgMSBpbnRlcmFjdGlvbiBpcyBhbGxvd2VkIGF0IGEgdGltZSAoZm9yIGJhY2t3YXJkc1xuICAgICAqIGNvbXBhdGliaWxpdHkpLiBUbyBhbGxvdyBtdWx0aXBsZSBpbnRlcmFjdGlvbnMgb24gdGhlIHNhbWUgSW50ZXJhY3RhYmxlc1xuICAgICAqIGFuZCBlbGVtZW50cywgeW91IG5lZWQgdG8gZW5hYmxlIGl0IGluIHRoZSBkcmFnZ2FibGUsIHJlc2l6YWJsZSBhbmRcbiAgICAgKiBnZXN0dXJhYmxlIGAnbWF4J2AgYW5kIGAnbWF4UGVyRWxlbWVudCdgIG9wdGlvbnMuXG4gICAgICoqXG4gICAgIC0gbmV3VmFsdWUgKG51bWJlcikgI29wdGlvbmFsIEFueSBudW1iZXIuIG5ld1ZhbHVlIDw9IDAgbWVhbnMgbm8gaW50ZXJhY3Rpb25zLlxuICAgIFxcKi9cbiAgICBpbnRlcmFjdC5tYXhJbnRlcmFjdGlvbnMgPSBmdW5jdGlvbiAobmV3VmFsdWUpIHtcbiAgICAgICAgaWYgKGlzTnVtYmVyKG5ld1ZhbHVlKSkge1xuICAgICAgICAgICAgbWF4SW50ZXJhY3Rpb25zID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIG1heEludGVyYWN0aW9ucztcbiAgICB9O1xuXG4gICAgaW50ZXJhY3QuY3JlYXRlU25hcEdyaWQgPSBmdW5jdGlvbiAoZ3JpZCkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKHgsIHkpIHtcbiAgICAgICAgICAgIHZhciBvZmZzZXRYID0gMCxcbiAgICAgICAgICAgICAgICBvZmZzZXRZID0gMDtcblxuICAgICAgICAgICAgaWYgKGlzT2JqZWN0KGdyaWQub2Zmc2V0KSkge1xuICAgICAgICAgICAgICAgIG9mZnNldFggPSBncmlkLm9mZnNldC54O1xuICAgICAgICAgICAgICAgIG9mZnNldFkgPSBncmlkLm9mZnNldC55O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgZ3JpZHggPSBNYXRoLnJvdW5kKCh4IC0gb2Zmc2V0WCkgLyBncmlkLngpLFxuICAgICAgICAgICAgICAgIGdyaWR5ID0gTWF0aC5yb3VuZCgoeSAtIG9mZnNldFkpIC8gZ3JpZC55KSxcblxuICAgICAgICAgICAgICAgIG5ld1ggPSBncmlkeCAqIGdyaWQueCArIG9mZnNldFgsXG4gICAgICAgICAgICAgICAgbmV3WSA9IGdyaWR5ICogZ3JpZC55ICsgb2Zmc2V0WTtcblxuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICB4OiBuZXdYLFxuICAgICAgICAgICAgICAgIHk6IG5ld1ksXG4gICAgICAgICAgICAgICAgcmFuZ2U6IGdyaWQucmFuZ2VcbiAgICAgICAgICAgIH07XG4gICAgICAgIH07XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGVuZEFsbEludGVyYWN0aW9ucyAoZXZlbnQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBpbnRlcmFjdGlvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGludGVyYWN0aW9uc1tpXS5wb2ludGVyRW5kKGV2ZW50LCBldmVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaXN0ZW5Ub0RvY3VtZW50IChkb2MpIHtcbiAgICAgICAgaWYgKGNvbnRhaW5zKGRvY3VtZW50cywgZG9jKSkgeyByZXR1cm47IH1cblxuICAgICAgICB2YXIgd2luID0gZG9jLmRlZmF1bHRWaWV3IHx8IGRvYy5wYXJlbnRXaW5kb3c7XG5cbiAgICAgICAgLy8gYWRkIGRlbGVnYXRlIGV2ZW50IGxpc3RlbmVyXG4gICAgICAgIGZvciAodmFyIGV2ZW50VHlwZSBpbiBkZWxlZ2F0ZWRFdmVudHMpIHtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBldmVudFR5cGUsIGRlbGVnYXRlTGlzdGVuZXIpO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsIGV2ZW50VHlwZSwgZGVsZWdhdGVVc2VDYXB0dXJlLCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChQb2ludGVyRXZlbnQpIHtcbiAgICAgICAgICAgIGlmIChQb2ludGVyRXZlbnQgPT09IHdpbi5NU1BvaW50ZXJFdmVudCkge1xuICAgICAgICAgICAgICAgIHBFdmVudFR5cGVzID0ge1xuICAgICAgICAgICAgICAgICAgICB1cDogJ01TUG9pbnRlclVwJywgZG93bjogJ01TUG9pbnRlckRvd24nLCBvdmVyOiAnbW91c2VvdmVyJyxcbiAgICAgICAgICAgICAgICAgICAgb3V0OiAnbW91c2VvdXQnLCBtb3ZlOiAnTVNQb2ludGVyTW92ZScsIGNhbmNlbDogJ01TUG9pbnRlckNhbmNlbCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIHBFdmVudFR5cGVzID0ge1xuICAgICAgICAgICAgICAgICAgICB1cDogJ3BvaW50ZXJ1cCcsIGRvd246ICdwb2ludGVyZG93bicsIG92ZXI6ICdwb2ludGVyb3ZlcicsXG4gICAgICAgICAgICAgICAgICAgIG91dDogJ3BvaW50ZXJvdXQnLCBtb3ZlOiAncG9pbnRlcm1vdmUnLCBjYW5jZWw6ICdwb2ludGVyY2FuY2VsJyB9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMuZG93biAgLCBsaXN0ZW5lcnMuc2VsZWN0b3JEb3duICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMubW92ZSAgLCBsaXN0ZW5lcnMucG9pbnRlck1vdmUgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMub3ZlciAgLCBsaXN0ZW5lcnMucG9pbnRlck92ZXIgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMub3V0ICAgLCBsaXN0ZW5lcnMucG9pbnRlck91dCAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMudXAgICAgLCBsaXN0ZW5lcnMucG9pbnRlclVwICAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgcEV2ZW50VHlwZXMuY2FuY2VsLCBsaXN0ZW5lcnMucG9pbnRlckNhbmNlbCk7XG5cbiAgICAgICAgICAgIC8vIGF1dG9zY3JvbGxcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCBwRXZlbnRUeXBlcy5tb3ZlLCBhdXRvU2Nyb2xsLmVkZ2VNb3ZlKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2Vkb3duJywgbGlzdGVuZXJzLnNlbGVjdG9yRG93bik7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNlbW92ZScsIGxpc3RlbmVycy5wb2ludGVyTW92ZSApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICdtb3VzZXVwJyAgLCBsaXN0ZW5lcnMucG9pbnRlclVwICAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAnbW91c2VvdmVyJywgbGlzdGVuZXJzLnBvaW50ZXJPdmVyICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNlb3V0JyAsIGxpc3RlbmVycy5wb2ludGVyT3V0ICApO1xuXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3RvdWNoc3RhcnQnICwgbGlzdGVuZXJzLnNlbGVjdG9yRG93biApO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaG1vdmUnICAsIGxpc3RlbmVycy5wb2ludGVyTW92ZSAgKTtcbiAgICAgICAgICAgIGV2ZW50cy5hZGQoZG9jLCAndG91Y2hlbmQnICAgLCBsaXN0ZW5lcnMucG9pbnRlclVwICAgICk7XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3RvdWNoY2FuY2VsJywgbGlzdGVuZXJzLnBvaW50ZXJDYW5jZWwpO1xuXG4gICAgICAgICAgICAvLyBhdXRvc2Nyb2xsXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ21vdXNlbW92ZScsIGF1dG9TY3JvbGwuZWRnZU1vdmUpO1xuICAgICAgICAgICAgZXZlbnRzLmFkZChkb2MsICd0b3VjaG1vdmUnLCBhdXRvU2Nyb2xsLmVkZ2VNb3ZlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGV2ZW50cy5hZGQod2luLCAnYmx1cicsIGVuZEFsbEludGVyYWN0aW9ucyk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICh3aW4uZnJhbWVFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhcmVudERvYyA9IHdpbi5mcmFtZUVsZW1lbnQub3duZXJEb2N1bWVudCxcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50V2luZG93ID0gcGFyZW50RG9jLmRlZmF1bHRWaWV3O1xuXG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICdtb3VzZXVwJyAgICAgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50RG9jICAgLCAndG91Y2hlbmQnICAgICAsIGxpc3RlbmVycy5wb2ludGVyRW5kKTtcbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudERvYyAgICwgJ3RvdWNoY2FuY2VsJyAgLCBsaXN0ZW5lcnMucG9pbnRlckVuZCk7XG4gICAgICAgICAgICAgICAgZXZlbnRzLmFkZChwYXJlbnREb2MgICAsICdwb2ludGVydXAnICAgICwgbGlzdGVuZXJzLnBvaW50ZXJFbmQpO1xuICAgICAgICAgICAgICAgIGV2ZW50cy5hZGQocGFyZW50RG9jICAgLCAnTVNQb2ludGVyVXAnICAsIGxpc3RlbmVycy5wb2ludGVyRW5kKTtcbiAgICAgICAgICAgICAgICBldmVudHMuYWRkKHBhcmVudFdpbmRvdywgJ2JsdXInICAgICAgICAgLCBlbmRBbGxJbnRlcmFjdGlvbnMgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGludGVyYWN0LndpbmRvd1BhcmVudEVycm9yID0gZXJyb3I7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXZlbnRzLnVzZUF0dGFjaEV2ZW50KSB7XG4gICAgICAgICAgICAvLyBGb3IgSUUncyBsYWNrIG9mIEV2ZW50I3ByZXZlbnREZWZhdWx0XG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ3NlbGVjdHN0YXJ0JywgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICAgICAgdmFyIGludGVyYWN0aW9uID0gaW50ZXJhY3Rpb25zWzBdO1xuXG4gICAgICAgICAgICAgICAgaWYgKGludGVyYWN0aW9uLmN1cnJlbnRBY3Rpb24oKSkge1xuICAgICAgICAgICAgICAgICAgICBpbnRlcmFjdGlvbi5jaGVja0FuZFByZXZlbnREZWZhdWx0KGV2ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gRm9yIElFJ3MgYmFkIGRibGNsaWNrIGV2ZW50IHNlcXVlbmNlXG4gICAgICAgICAgICBldmVudHMuYWRkKGRvYywgJ2RibGNsaWNrJywgZG9PbkludGVyYWN0aW9ucygnaWU4RGJsY2xpY2snKSk7XG4gICAgICAgIH1cblxuICAgICAgICBkb2N1bWVudHMucHVzaChkb2MpO1xuICAgIH1cblxuICAgIGxpc3RlblRvRG9jdW1lbnQoZG9jdW1lbnQpO1xuXG4gICAgZnVuY3Rpb24gaW5kZXhPZiAoYXJyYXksIHRhcmdldCkge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGlmIChhcnJheVtpXSA9PT0gdGFyZ2V0KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29udGFpbnMgKGFycmF5LCB0YXJnZXQpIHtcbiAgICAgICAgcmV0dXJuIGluZGV4T2YoYXJyYXksIHRhcmdldCkgIT09IC0xO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1hdGNoZXNTZWxlY3RvciAoZWxlbWVudCwgc2VsZWN0b3IsIG5vZGVMaXN0KSB7XG4gICAgICAgIGlmIChpZThNYXRjaGVzU2VsZWN0b3IpIHtcbiAgICAgICAgICAgIHJldHVybiBpZThNYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IsIG5vZGVMaXN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHJlbW92ZSAvZGVlcC8gZnJvbSBzZWxlY3RvcnMgaWYgc2hhZG93RE9NIHBvbHlmaWxsIGlzIHVzZWRcbiAgICAgICAgaWYgKHdpbmRvdyAhPT0gcmVhbFdpbmRvdykge1xuICAgICAgICAgICAgc2VsZWN0b3IgPSBzZWxlY3Rvci5yZXBsYWNlKC9cXC9kZWVwXFwvL2csICcgJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZWxlbWVudFtwcmVmaXhlZE1hdGNoZXNTZWxlY3Rvcl0oc2VsZWN0b3IpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG1hdGNoZXNVcFRvIChlbGVtZW50LCBzZWxlY3RvciwgbGltaXQpIHtcbiAgICAgICAgd2hpbGUgKGlzRWxlbWVudChlbGVtZW50KSkge1xuICAgICAgICAgICAgaWYgKG1hdGNoZXNTZWxlY3RvcihlbGVtZW50LCBzZWxlY3RvcikpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudCA9IHBhcmVudEVsZW1lbnQoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50ID09PSBsaW1pdCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBtYXRjaGVzU2VsZWN0b3IoZWxlbWVudCwgc2VsZWN0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIC8vIEZvciBJRTgncyBsYWNrIG9mIGFuIEVsZW1lbnQjbWF0Y2hlc1NlbGVjdG9yXG4gICAgLy8gdGFrZW4gZnJvbSBodHRwOi8vdGFuYWxpbi5jb20vZW4vYmxvZy8yMDEyLzEyL21hdGNoZXMtc2VsZWN0b3ItaWU4LyBhbmQgbW9kaWZpZWRcbiAgICBpZiAoIShwcmVmaXhlZE1hdGNoZXNTZWxlY3RvciBpbiBFbGVtZW50LnByb3RvdHlwZSkgfHwgIWlzRnVuY3Rpb24oRWxlbWVudC5wcm90b3R5cGVbcHJlZml4ZWRNYXRjaGVzU2VsZWN0b3JdKSkge1xuICAgICAgICBpZThNYXRjaGVzU2VsZWN0b3IgPSBmdW5jdGlvbiAoZWxlbWVudCwgc2VsZWN0b3IsIGVsZW1zKSB7XG4gICAgICAgICAgICBlbGVtcyA9IGVsZW1zIHx8IGVsZW1lbnQucGFyZW50Tm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcblxuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IGVsZW1zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVsZW1zW2ldID09PSBlbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8vIHJlcXVlc3RBbmltYXRpb25GcmFtZSBwb2x5ZmlsbFxuICAgIChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGxhc3RUaW1lID0gMCxcbiAgICAgICAgICAgIHZlbmRvcnMgPSBbJ21zJywgJ21veicsICd3ZWJraXQnLCAnbyddO1xuXG4gICAgICAgIGZvcih2YXIgeCA9IDA7IHggPCB2ZW5kb3JzLmxlbmd0aCAmJiAhcmVhbFdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWU7ICsreCkge1xuICAgICAgICAgICAgcmVxRnJhbWUgPSByZWFsV2luZG93W3ZlbmRvcnNbeF0rJ1JlcXVlc3RBbmltYXRpb25GcmFtZSddO1xuICAgICAgICAgICAgY2FuY2VsRnJhbWUgPSByZWFsV2luZG93W3ZlbmRvcnNbeF0rJ0NhbmNlbEFuaW1hdGlvbkZyYW1lJ10gfHwgcmVhbFdpbmRvd1t2ZW5kb3JzW3hdKydDYW5jZWxSZXF1ZXN0QW5pbWF0aW9uRnJhbWUnXTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghcmVxRnJhbWUpIHtcbiAgICAgICAgICAgIHJlcUZyYW1lID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICB2YXIgY3VyclRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKSxcbiAgICAgICAgICAgICAgICAgICAgdGltZVRvQ2FsbCA9IE1hdGgubWF4KDAsIDE2IC0gKGN1cnJUaW1lIC0gbGFzdFRpbWUpKSxcbiAgICAgICAgICAgICAgICAgICAgaWQgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjdXJyVGltZSArIHRpbWVUb0NhbGwpOyB9LFxuICAgICAgICAgICAgICAgICAgdGltZVRvQ2FsbCk7XG4gICAgICAgICAgICAgICAgbGFzdFRpbWUgPSBjdXJyVGltZSArIHRpbWVUb0NhbGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGlkO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghY2FuY2VsRnJhbWUpIHtcbiAgICAgICAgICAgIGNhbmNlbEZyYW1lID0gZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQoaWQpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH0oKSk7XG5cbiAgICAvKiBnbG9iYWwgZXhwb3J0czogdHJ1ZSwgbW9kdWxlLCBkZWZpbmUgKi9cblxuICAgIC8vIGh0dHA6Ly9kb2N1bWVudGNsb3VkLmdpdGh1Yi5pby91bmRlcnNjb3JlL2RvY3MvdW5kZXJzY29yZS5odG1sI3NlY3Rpb24tMTFcbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gaW50ZXJhY3Q7XG4gICAgICAgIH1cbiAgICAgICAgZXhwb3J0cy5pbnRlcmFjdCA9IGludGVyYWN0O1xuICAgIH1cbiAgICAvLyBBTURcbiAgICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICAgICAgZGVmaW5lKCdpbnRlcmFjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmV0dXJuIGludGVyYWN0O1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHJlYWxXaW5kb3cuaW50ZXJhY3QgPSBpbnRlcmFjdDtcbiAgICB9XG5cbn0gKHdpbmRvdykpO1xuIiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG5yZXF1aXJlKCd0ZW1wbGF0ZXMnKTtcclxucmVxdWlyZSgnaW50ZXJhY3QuanMnKTtcclxuXHJcbnZhciBhcHAgPSBhbmd1bGFyLm1vZHVsZSgnQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMnLCBbJ0J1aWxkaW5nQmxveC5EaXJlY3RpdmVzLlRlbXBsYXRlcycsIHJlcXVpcmUoJy4vaGVscGVycycpXSlcclxuICAgIC5wcm92aWRlcignQnVpbGRpbmdCbG94RGlyZWN0aXZlcycsIGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAndXNlIHN0cmljdCc7XHJcbiAgICAgICAgdmFyIGJhc2VPcHRpb25zID0ge1xyXG4gICAgICAgICAgICAgICAgYm9vdHN0cmFwOiBmYWxzZVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBnZXRWYWx1ZSA9IGZ1bmN0aW9uIChvcHRpb25zLCBuYW1lKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gb3B0aW9ucy5oYXNPd25Qcm9wZXJ0eShuYW1lKSA/IG9wdGlvbnNbbmFtZV0gOiBiYXNlT3B0aW9uc1tuYW1lXTtcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgc2V0VmFsdWUgPSBmdW5jdGlvbiAob3B0aW9ucywgbmFtZSkge1xyXG4gICAgICAgICAgICAgICAgYmFzZU9wdGlvbnNbbmFtZV0gPSBnZXRWYWx1ZShvcHRpb25zLCBuYW1lKTtcclxuICAgICAgICAgICAgfTtcclxuXHJcbiAgICAgICAgZnVuY3Rpb24gQnVpbGRpbmdCbG94RGlyZWN0aXZlc09wdGlvbnMob3B0aW9ucykge1xyXG4gICAgICAgICAgICB0aGlzLmJvb3RzdHJhcCA9IG9wdGlvbnMuYm9vdHN0cmFwO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5pbml0ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcclxuICAgICAgICAgICAgc2V0VmFsdWUob3B0aW9ucywgJ2Jvb3RzdHJhcCcpO1xyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIHRoaXMuJGdldCA9IFtmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBuZXcgQnVpbGRpbmdCbG94RGlyZWN0aXZlc09wdGlvbnMoYmFzZU9wdGlvbnMpO1xyXG4gICAgICAgIH1dO1xyXG4gICAgfSk7XHJcblxyXG52YXIgZXhwb3J0cyA9IGFwcDtcclxubW9kdWxlLmV4cG9ydHMgPSBhcHA7XHJcblxyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvYWJiTGlzdC5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJhZ0FyZWEuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2RyYWdnYWJsZS5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJhZ2dhYmxlTGlzdC5qcycpO1xyXG5yZXF1aXJlKCcuL2RpcmVjdGl2ZXMvZHJvcGFyZWEuanMnKTtcclxucmVxdWlyZSgnLi9kaXJlY3RpdmVzL2hpZGRlbklucHV0LmpzJyk7XHJcbnJlcXVpcmUoJy4vZGlyZWN0aXZlcy9saXN0SXRlbS5qcycpOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGFwcCA9IHJlcXVpcmUoJy4uL2J1aWxkaW5nQmxveC5kaXJlY3RpdmVzLmpzJyk7XHJcbmFwcC5kaXJlY3RpdmUoJ2FiYkxpc3QnLCBbJ2FiYkdlbmVyYXRvcnMnLCAnYWJiQXJyYXlIZWxwZXJzJywgZnVuY3Rpb24gKGdlbmVyYXRvcnMsIGFycmF5SGVscGVycykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0UnLFxyXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnc3JjL3RlbXBsYXRlcy9hYmJMaXN0Lmh0bWwnLFxyXG4gICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgIG1vZGVsOiAnPW5nTW9kZWwnLFxyXG4gICAgICAgICAgICBkaXNwbGF5UHJvcGVydHk6ICdAJyxcclxuICAgICAgICAgICAgaWRQcm9wZXJ0eTogJ0AnLFxyXG4gICAgICAgICAgICBsaXN0TmFtZVByb3BlcnR5OiAnQCcsXHJcbiAgICAgICAgICAgIGxpc3RQcm9wZXJ0eTogJ0AnXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb250cm9sbGVyOiBbJyRzY29wZScsIGZ1bmN0aW9uICgkc2NvcGUpIHtcclxuICAgICAgICAgICAgdmFyIGdldElkUHJvcGVydHkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUuaWRQcm9wZXJ0eSB8fCAnX2lkJzsgfSxcclxuICAgICAgICAgICAgICAgIGdldERpc3BsYXlQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5kaXNwbGF5UHJvcGVydHkgfHwgJ3ZhbHVlJzsgfSxcclxuICAgICAgICAgICAgICAgIGdldExpc3ROYW1lUHJvcGVydHkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUubGlzdE5hbWVQcm9wZXJ0eSB8fCAnbmFtZSc7IH0sXHJcbiAgICAgICAgICAgICAgICBnZXRMaXN0UHJvcGVydHkgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUubGlzdFByb3BlcnR5IHx8ICdsaXN0JzsgfSxcclxuICAgICAgICAgICAgICAgIGdldExpc3QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAkc2NvcGUubW9kZWxbZ2V0TGlzdFByb3BlcnR5KCldOyB9LFxyXG4gICAgICAgICAgICAgICAgbmV3SXRlbTtcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5nZXRJZFByb3BlcnR5ID0gZ2V0SWRQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldERpc3BsYXlQcm9wZXJ0eSA9IGdldERpc3BsYXlQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldExpc3ROYW1lUHJvcGVydHkgPSBnZXRMaXN0TmFtZVByb3BlcnR5O1xyXG4gICAgICAgICAgICAkc2NvcGUuZ2V0TGlzdCA9IGdldExpc3Q7XHJcbiAgICAgICAgICAgIGlmICghJHNjb3BlLm1vZGVsKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYXJyYXlIZWxwZXJzLmVhY2goZ2V0TGlzdCgpLCBmdW5jdGlvbiAoaXRlbSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbSAhPT0gJ29iamVjdCcpIHtcclxuICAgICAgICAgICAgICAgICAgICBuZXdJdGVtID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3SXRlbVtnZXREaXNwbGF5UHJvcGVydHkoKV0gPSBpdGVtO1xyXG4gICAgICAgICAgICAgICAgICAgIGl0ZW0gPSBuZXdJdGVtO1xyXG4gICAgICAgICAgICAgICAgICAgIGdldExpc3QoKS5zcGxpY2UoaW5kZXgsIDEsIGl0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaXRlbVtnZXRJZFByb3BlcnR5KCldID0gaXRlbVtnZXRJZFByb3BlcnR5KCldIHx8IGdlbmVyYXRvcnMuZ3VpZCgpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgJHNjb3BlLm1vZGVsW2dldExpc3ROYW1lUHJvcGVydHkoKV0gPSAkc2NvcGUubW9kZWxbZ2V0TGlzdE5hbWVQcm9wZXJ0eSgpXSB8fCAnVW50aXRsZWQnO1xyXG4gICAgICAgIH1dXHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgaW50ZXJhY3QgPSByZXF1aXJlKCdpbnRlcmFjdC5qcycpO1xyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYnVpbGRpbmdCbG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ0FyZWEnLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0MnLFxyXG4gICAgICAgIHNjb3BlOiB7XHJcbiAgICAgICAgICAgIHJlbW92ZTogJz0nXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjb250cm9sbGVyOiBbJyRzY29wZScsIGZ1bmN0aW9uICgkc2NvcGUpIHtcclxuICAgICAgICAgICAgdGhpcy5yZW1vdmUgPSAkc2NvcGUucmVtb3ZlO1xyXG4gICAgICAgIH1dXHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgaW50ZXJhY3QgPSByZXF1aXJlKCdpbnRlcmFjdC5qcycpO1xyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYnVpbGRpbmdCbG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ2dhYmxlJywgW2Z1bmN0aW9uICgpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdDJyxcclxuICAgICAgICByZXF1aXJlOiAnXmRyYWdBcmVhJyxcclxuICAgICAgICBsaW5rOiBmdW5jdGlvbiAoc2NvcGUsIGVsZW1lbnQsIGF0dHJzLCBkcmFnQXJlYUNvbnRyb2xsZXIpIHtcclxuICAgICAgICAgICAgdmFyIGh0bWxFbGVtZW50ID0gZWxlbWVudFswXSxcclxuICAgICAgICAgICAgICAgIGludGVyYWN0aWJsZTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlID0gaW50ZXJhY3QoaHRtbEVsZW1lbnQpO1xyXG4gICAgICAgICAgICBpbnRlcmFjdGlibGUuZHJhZ2dhYmxlKHtcclxuICAgICAgICAgICAgICAgIG9ubW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIHRhcmdldCA9IGV2ZW50LnRhcmdldCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgeCA9IChwYXJzZUludCh0YXJnZXQuZ2V0QXR0cmlidXRlKCdkYXRhLXgnKSwgMTApIHx8IDApICsgZXZlbnQuZHgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHkgPSAocGFyc2VJbnQodGFyZ2V0LmdldEF0dHJpYnV0ZSgnZGF0YS15JyksIDEwKSB8fCAwKSArIGV2ZW50LmR5O1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuY3NzKHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3RyYW5zaXRpb24nOiAnJyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgJ3otaW5kZXgnOiAxMDAwLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAndHJhbnNmb3JtJzogJ3RyYW5zbGF0ZSgnICsgeCArICdweCwgJyArIHkgKyAncHgpJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYXR0cignZGF0YS14JywgeCk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXknLCB5KTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmFkZENsYXNzKCd0cmFuc3BhcmVudCcpO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIG9uZW5kOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5jc3Moe1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAnei1pbmRleCc6IDAsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICd0cmFuc2Zvcm0nOiAnJ1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuYXR0cignZGF0YS14JywgMCk7XHJcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5hdHRyKCdkYXRhLXknLCAwKTtcclxuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnJlbW92ZUNsYXNzKCd0cmFuc3BhcmVudCcpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlLmdldEl0ZW0gPSBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoc2NvcGUuaXRlbSAmJiBzY29wZS5nZXRJZFByb3BlcnR5KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHNjb3BlLml0ZW07XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlLnJlbW92ZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgIGlmIChzY29wZS5pdGVtICYmIHNjb3BlLmdldElkUHJvcGVydHkgJiYgZHJhZ0FyZWFDb250cm9sbGVyLnJlbW92ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGRyYWdBcmVhQ29udHJvbGxlci5yZW1vdmUoc2NvcGUuaXRlbVtzY29wZS5nZXRJZFByb3BlcnR5KCldKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYnVpbGRpbmdCbG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnZHJhZ2dhYmxlTGlzdCcsIFsnYWJiR2VuZXJhdG9ycycsICdhYmJBcnJheUhlbHBlcnMnLCBmdW5jdGlvbiAoZ2VuZXJhdG9ycywgYXJyYXlIZWxwZXJzKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnRScsXHJcbiAgICAgICAgdGVtcGxhdGVVcmw6ICdzcmMvdGVtcGxhdGVzL2RyYWdnYWJsZUxpc3QuaHRtbCcsXHJcbiAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICAgICAgbW9kZWw6ICc9bmdNb2RlbCcsXHJcbiAgICAgICAgICAgIGRpc3BsYXlQcm9wZXJ0eTogJ0AnLFxyXG4gICAgICAgICAgICBpZFByb3BlcnR5OiAnQCcsXHJcbiAgICAgICAgICAgIGxpc3ROYW1lUHJvcGVydHk6ICdAJyxcclxuICAgICAgICAgICAgbGlzdFByb3BlcnR5OiAnQCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbnRyb2xsZXI6IFsnJHNjb3BlJywgZnVuY3Rpb24gKCRzY29wZSkge1xyXG4gICAgICAgICAgICB2YXIgZ2V0SWRQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5pZFByb3BlcnR5IHx8ICdfaWQnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0RGlzcGxheVByb3BlcnR5ID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLmRpc3BsYXlQcm9wZXJ0eSB8fCAndmFsdWUnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0TGlzdE5hbWVQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5saXN0TmFtZVByb3BlcnR5IHx8ICduYW1lJzsgfSxcclxuICAgICAgICAgICAgICAgIGdldExpc3RQcm9wZXJ0eSA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5saXN0UHJvcGVydHkgfHwgJ2xpc3QnOyB9LFxyXG4gICAgICAgICAgICAgICAgZ2V0TGlzdCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICRzY29wZS5tb2RlbFtnZXRMaXN0UHJvcGVydHkoKV07IH0sXHJcbiAgICAgICAgICAgICAgICBnZXRJbmRleE9mSWQgPSBmdW5jdGlvbiAoaWQsIGRlZmF1bHRWYWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBhcnJheUhlbHBlcnMuZmlyc3RSZXR1cm4oZ2V0TGlzdCgpLCBmdW5jdGlvbiAoaXRlbSwgaW5kZXgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9PT0gaWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBpbmRleDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0sIGRlZmF1bHRWYWx1ZSk7XHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9LFxyXG4gICAgICAgICAgICAgICAgbmV3SXRlbTtcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5nZXRJZFByb3BlcnR5ID0gZ2V0SWRQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldERpc3BsYXlQcm9wZXJ0eSA9IGdldERpc3BsYXlQcm9wZXJ0eTtcclxuICAgICAgICAgICAgJHNjb3BlLmdldExpc3ROYW1lUHJvcGVydHkgPSBnZXRMaXN0TmFtZVByb3BlcnR5O1xyXG4gICAgICAgICAgICAkc2NvcGUuZ2V0TGlzdCA9IGdldExpc3Q7XHJcbiAgICAgICAgICAgICRzY29wZS5hZGRUb0xpc3QgPSBmdW5jdGlvbiAoZXYpIHtcclxuICAgICAgICAgICAgICAgIG5ld0l0ZW0gPSBldi5kcmFnZ2FibGUuZ2V0SXRlbSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5pbmRleE9mKG5ld0l0ZW0pID49IDApIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBldi5kcmFnZ2FibGUucmVtb3ZlKCk7XHJcbiAgICAgICAgICAgICAgICBpZiAobmV3SXRlbSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGdldExpc3QoKS5wdXNoKG5ld0l0ZW0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgICAgICBpZiAoISRzY29wZS5tb2RlbCkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGFycmF5SGVscGVycy5lYWNoKGdldExpc3QoKSwgZnVuY3Rpb24gKGl0ZW0sIGluZGV4KSB7XHJcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmV3SXRlbSA9IHt9O1xyXG4gICAgICAgICAgICAgICAgICAgIG5ld0l0ZW1bZ2V0RGlzcGxheVByb3BlcnR5KCldID0gaXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBpdGVtID0gbmV3SXRlbTtcclxuICAgICAgICAgICAgICAgICAgICBnZXRMaXN0KCkuc3BsaWNlKGluZGV4LCAxLCBpdGVtKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSA9IGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXSB8fCBnZW5lcmF0b3JzLmd1aWQoKTtcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgICRzY29wZS5tb2RlbFtnZXRMaXN0TmFtZVByb3BlcnR5KCldID0gJHNjb3BlLm1vZGVsW2dldExpc3ROYW1lUHJvcGVydHkoKV0gfHwgJ1VudGl0bGVkJztcclxuXHJcbiAgICAgICAgICAgICRzY29wZS5yZW1vdmVCeUlkID0gZnVuY3Rpb24gKGlkKSB7XHJcbiAgICAgICAgICAgICAgICB2YXIgZGVmYXVsdFZhbHVlID0gLTEsXHJcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlSW5kZXg7XHJcbiAgICAgICAgICAgICAgICByZW1vdmVJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVJbmRleCAhPT0gZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGdldExpc3QoKS5zcGxpY2UpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZ2V0TGlzdCgpLnNwbGljZShyZW1vdmVJbmRleCwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGdldExpc3QoKVtyZW1vdmVJbmRleF07XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgYWRkQmVmb3JlTGlzdCA9IHt9O1xyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgJHNjb3BlLmNyZWF0ZUFkZEJlZm9yZSA9IGZ1bmN0aW9uIChpZCkge1xyXG4gICAgICAgICAgICAgICAgdmFyIGRlZmF1bHRWYWx1ZSA9IC0xLFxyXG4gICAgICAgICAgICAgICAgICAgIGlkSW5kZXg7XHJcbiAgICAgICAgICAgICAgICBpZiAoIWFkZEJlZm9yZUxpc3RbJ19pZF8nICsgaWRdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWRJbmRleCA9IGdldEluZGV4T2ZJZChpZCwgZGVmYXVsdFZhbHVlKTtcclxuICAgICAgICAgICAgICAgICAgICBhZGRCZWZvcmVMaXN0WydfaWRfJyArIGlkXSA9IGZ1bmN0aW9uIChldikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBuZXdJdGVtID0gZXYuZHJhZ2dhYmxlLmdldEl0ZW0oKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgZXYuZHJhZ2dhYmxlLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBnZXRMaXN0KCkuc3BsaWNlKGlkSW5kZXgsIDAsIG5ld0l0ZW0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhZGRCZWZvcmVMaXN0ID0ge307XHJcbiAgICAgICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIHJldHVybiBhZGRCZWZvcmVMaXN0WydfaWRfJyArIGlkXTtcclxuICAgICAgICAgICAgfTtcclxuICAgICAgICB9XVxyXG4gICAgfTtcclxufV0pOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGludGVyYWN0ID0gcmVxdWlyZSgnaW50ZXJhY3QuanMnKTtcclxudmFyIGFwcCA9IHJlcXVpcmUoJy4uL2J1aWxkaW5nQmxveC5kaXJlY3RpdmVzLmpzJyk7XHJcbmFwcC5kaXJlY3RpdmUoJ2Ryb3BBcmVhJywgW2Z1bmN0aW9uICgpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgcmVzdHJpY3Q6ICdDJyxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgICAgICBvbkRyb3A6ICc9JyxcclxuICAgICAgICAgICAgb25EcmFnRW50ZXI6ICc9JyxcclxuICAgICAgICAgICAgb25EcmFnTGVhdmU6ICc9J1xyXG4gICAgICAgIH0sXHJcbiAgICAgICAgbGluazogZnVuY3Rpb24gKHNjb3BlLCBlbGVtZW50KSB7XHJcbiAgICAgICAgICAgIHZhciBodG1sRWxlbWVudCA9IGVsZW1lbnRbMF0sXHJcbiAgICAgICAgICAgICAgICBpbnRlcmFjdGlibGU7XHJcbiAgICAgICAgICAgIGludGVyYWN0aWJsZSA9IGludGVyYWN0KGh0bWxFbGVtZW50KTtcclxuICAgICAgICAgICAgaW50ZXJhY3RpYmxlLmRyb3B6b25lKHtcclxuICAgICAgICAgICAgICAgIGFjY2VwdDogJy5kcmFnZ2FibGUnLFxyXG4gICAgICAgICAgICAgICAgb3ZlcmxhcDogJ3BvaW50ZXInLFxyXG4gICAgICAgICAgICAgICAgb25kcmFnZW50ZXI6IGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoIXNjb3BlLm9uRHJhZ0VudGVyKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XHJcbiAgICAgICAgICAgICAgICAgICAgc2NvcGUuJGFwcGx5KGZ1bmN0aW9uICgpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2NvcGUub25EcmFnRW50ZXIuYXBwbHkoc2NvcGUsIGFyZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgICAgIG9uZHJhZ2xlYXZlOiBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY29wZS5vbkRyYWdMZWF2ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xyXG4gICAgICAgICAgICAgICAgICAgIHNjb3BlLiRhcHBseShmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjb3BlLm9uRHJhZ0xlYXZlLmFwcGx5KHNjb3BlLCBhcmdzKTtcclxuICAgICAgICAgICAgICAgICAgICB9KTtcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBvbmRyb3A6ICBmdW5jdGlvbiAoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFzY29wZS5vbkRyb3ApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcclxuICAgICAgICAgICAgICAgICAgICBzY29wZS4kYXBwbHkoZnVuY3Rpb24gKCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBzY29wZS5vbkRyb3AuYXBwbHkoc2NvcGUsIGFyZ3MpO1xyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlLCBpbnRlcmFjdCovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIGFwcCA9IHJlcXVpcmUoJy4uL2J1aWxkaW5nQmxveC5kaXJlY3RpdmVzLmpzJyk7XHJcbmFwcC5kaXJlY3RpdmUoJ2hpZGRlbklucHV0JywgWydhYmJBcnJheUhlbHBlcnMnLCBmdW5jdGlvbiAoYXJyYXlIZWxwZXJzKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHJlc3RyaWN0OiAnRScsXHJcbiAgICAgICAgdGVtcGxhdGU6ICc8aW5wdXQgLz4nLFxyXG4gICAgICAgIHJlcGxhY2U6IHRydWUsXHJcbiAgICAgICAgc2NvcGU6IHtcclxuICAgICAgICB9LFxyXG4gICAgICAgIGxpbms6IGZ1bmN0aW9uIChzY29wZSwgZWxlbWVudCkge1xyXG4gICAgICAgICAgICB2YXIgaW5wdXRFbGVtZW50ID0gZWxlbWVudC5maW5kKCdpbnB1dCcpLFxyXG4gICAgICAgICAgICAgICAgcGFyZW50QXR0cmlidXRlcyA9IGVsZW1lbnRbMF0uYXR0cmlidXRlcztcclxuXHJcbiAgICAgICAgICAgIGFycmF5SGVscGVycy5lYWNoKHBhcmVudEF0dHJpYnV0ZXMsIGZ1bmN0aW9uIChhdHRyaWJ1dGVOb2RlKSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoYXR0cmlidXRlTm9kZS52YWx1ZSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlucHV0RWxlbWVudC5hdHRyKGF0dHJpYnV0ZU5vZGUubm9kZU5hbWUsIGF0dHJpYnV0ZU5vZGUudmFsdWUpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGlucHV0RWxlbWVudC5hZGRDbGFzcygnaGlkZGVuSW5wdXQnKTtcclxuICAgICAgICB9XHJcbiAgICB9O1xyXG59XSk7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG52YXIgYXBwID0gcmVxdWlyZSgnLi4vYnVpbGRpbmdCbG94LmRpcmVjdGl2ZXMuanMnKTtcclxuYXBwLmRpcmVjdGl2ZSgnbGlzdEl0ZW0nLCBbZnVuY3Rpb24gKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICByZXN0cmljdDogJ0UnLFxyXG4gICAgICAgIHRlbXBsYXRlVXJsOiAnc3JjL3RlbXBsYXRlcy9saXN0SXRlbS5odG1sJyxcclxuICAgICAgICBzY29wZToge1xyXG4gICAgICAgICAgICBtb2RlbDogJz1uZ01vZGVsJyxcclxuICAgICAgICAgICAgZGlzcGxheVByb3BlcnR5OiAnQCdcclxuICAgICAgICB9LFxyXG4gICAgICAgIGNvbnRyb2xsZXI6IFsnJHNjb3BlJywgJyRlbGVtZW50JywgZnVuY3Rpb24gKCRzY29wZSwgJGVsZW1lbnQpIHtcclxuICAgICAgICAgICAgJHNjb3BlLmdldFZhbHVlID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJHNjb3BlLm1vZGVsWyRzY29wZS5kaXNwbGF5UHJvcGVydHkgfHwgJ3ZhbHVlJ107IH07XHJcbiAgICAgICAgfV1cclxuICAgIH07XHJcbn1dKTsiLCIvKmdsb2JhbCBhbmd1bGFyLCByZXF1aXJlLCBtb2R1bGUqL1xyXG4vKmpzbGludCBicm93c2VyOiB0cnVlKi9cclxuXHJcbnZhciBkZWZhdWx0UmV0dXJuVmFsdWUgPSAtSW5maW5pdHk7XHJcblxyXG5mdW5jdGlvbiBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpLCBvYmopIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIG9iaiA9IG9iaiB8fCBhcnJbaV07XHJcbiAgICByZXR1cm4gZnVuYy5jYWxsKG9iaiwgb2JqLCBpLCBhcnIpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICByZXR1cm4gZGVmYXVsdFZhbHVlID09PSB1bmRlZmluZWQgPyBkZWZhdWx0UmV0dXJuVmFsdWUgOiBkZWZhdWx0VmFsdWU7XHJcbn1cclxuXHJcbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tICovXHJcblxyXG5mdW5jdGlvbiBlYWNoKGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGk7XHJcbiAgICBmb3IgKGkgaW4gYXJyKSB7XHJcbiAgICAgICAgaWYgKGFyci5oYXNPd25Qcm9wZXJ0eShpKSkge1xyXG4gICAgICAgICAgICBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpcnN0UmV0dXJuKGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGksIHZhbDtcclxuICAgIGZvciAoaSBpbiBhcnIpIHtcclxuICAgICAgICBpZiAoYXJyLmhhc093blByb3BlcnR5KGkpKSB7XHJcbiAgICAgICAgICAgIHZhbCA9IGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgICAgICBpZiAodmFsICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiB2YWw7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFsbChhcnIsIGZ1bmMpIHtcclxuICAgICd1c2Ugc3RyaWN0JztcclxuICAgIHZhciB2YWw7XHJcbiAgICB2YWwgPSBmaXJzdFJldHVybihhcnIsIGZ1bmN0aW9uIChvYmosIGkpIHtcclxuICAgICAgICB2YWwgPSBhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKTtcclxuICAgICAgICBpZiAoIXZhbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHZhbCB8fCBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gYW55KGFyciwgZnVuYykge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIHZhbDtcclxuICAgIHZhbCA9IGZpcnN0UmV0dXJuKGFyciwgZnVuY3Rpb24gKG9iaiwgaSkge1xyXG4gICAgICAgIHZhbCA9IGFycmF5Q2FsbEhlbHBlcihmdW5jLCBhcnIsIGkpO1xyXG4gICAgICAgIGlmICh2YWwpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcblxyXG4gICAgcmV0dXJuIHZhbCB8fCBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gd2hlcmUoYXJyLCBmdW5jKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgb3V0ID0gW107XHJcbiAgICBlYWNoKGFyciwgZnVuY3Rpb24gKG9iaiwgaSkge1xyXG4gICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICBvdXQucHVzaChvYmopO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG4gICAgcmV0dXJuIG91dDtcclxufVxyXG5cclxuZnVuY3Rpb24gc2luZ2xlKGFyciwgZnVuYywgZGVmYXVsdFZhbHVlKSB7XHJcbiAgICAndXNlIHN0cmljdCc7XHJcbiAgICB2YXIgb3V0LCBvdXRJc1NldDtcclxuICAgIGRlZmF1bHRWYWx1ZSA9IGdldERlZmF1bHRWYWx1ZShkZWZhdWx0VmFsdWUpO1xyXG4gICAgaWYgKHR5cGVvZiBmdW5jID09PSBcImZ1bmN0aW9uXCIpIHtcclxuICAgICAgICBvdXQgPSBkZWZhdWx0VmFsdWU7XHJcbiAgICAgICAgb3V0SXNTZXQgPSB0cnVlO1xyXG4gICAgICAgIGVhY2goYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKG91dElzU2V0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIG91dElzU2V0ID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgIG91dCA9IG9iajtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBvdXQ7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFyci5sZW5ndGggIT09IDEpIHtcclxuICAgICAgICByZXR1cm4gZ2V0RGVmYXVsdFZhbHVlKGRlZmF1bHRWYWx1ZSk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gYXJyWzBdO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaXJzdChhcnIsIGZ1bmMsIGRlZmF1bHRWYWx1ZSkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG5cclxuICAgIGlmIChhcnIubGVuZ3RoIDwgMSkge1xyXG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAodHlwZW9mIGZ1bmMgPT09IFwiZnVuY3Rpb25cIikge1xyXG4gICAgICAgIGVhY2goYXJyLCBmdW5jdGlvbiAob2JqLCBpKSB7XHJcbiAgICAgICAgICAgIGlmIChhcnJheUNhbGxIZWxwZXIoZnVuYywgYXJyLCBpKSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iajtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgICAgIHJldHVybiBnZXREZWZhdWx0VmFsdWUoZGVmYXVsdFZhbHVlKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gYXJyWzBdO1xyXG59XHJcblxyXG52YXIgYXJyYXlIZWxwZXJzID0ge1xyXG4gICAgZWFjaDogZWFjaCxcclxuICAgIGZpcnN0UmV0dXJuOiBmaXJzdFJldHVybixcclxuICAgIGFsbDogYWxsLFxyXG4gICAgYW55OiBhbnksXHJcbiAgICB3aGVyZTogd2hlcmUsXHJcbiAgICBzaW5nbGU6IHNpbmdsZSxcclxuICAgIGZpcnN0OiBmaXJzdFxyXG59O1xyXG5cclxuT2JqZWN0LmZyZWV6ZShhcnJheUhlbHBlcnMpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBhcnJheUhlbHBlcnM7IiwiLypnbG9iYWwgYW5ndWxhciwgcmVxdWlyZSwgbW9kdWxlKi9cclxuLypqc2xpbnQgYnJvd3NlcjogdHJ1ZSovXHJcblxyXG5mdW5jdGlvbiByYW5kSGV4KCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIHJhbmQgPSBNYXRoLnJhbmRvbSgpO1xyXG4gICAgcmFuZCA9IHBhcnNlSW50KHJhbmQgKiAxNiwgMTApO1xyXG4gICAgcmV0dXJuIHJhbmQudG9TdHJpbmcoMTYpO1xyXG59XHJcblxyXG5mdW5jdGlvbiBndWlkKCkge1xyXG4gICAgJ3VzZSBzdHJpY3QnO1xyXG4gICAgdmFyIGksXHJcbiAgICAgICAgb3V0cHV0ID0gJyc7XHJcblxyXG4gICAgZm9yIChpID0gMDsgaSA8IDg7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy0nO1xyXG4gICAgZm9yIChpID0gMDsgaSA8IDQ7IGkrKykge1xyXG4gICAgICAgIG91dHB1dCArPSByYW5kSGV4KCk7XHJcbiAgICB9XHJcbiAgICBvdXRwdXQgKz0gJy00JztcclxuICAgIGZvciAoaSA9IDA7IGkgPCAzOyBpKyspIHtcclxuICAgICAgICBvdXRwdXQgKz0gcmFuZEhleCgpO1xyXG4gICAgfVxyXG4gICAgb3V0cHV0ICs9ICctJztcclxuICAgIGZvciAoaSA9IDA7IGkgPCA0OyBpKyspIHtcclxuICAgICAgICBvdXRwdXQgKz0gcmFuZEhleCgpO1xyXG4gICAgfVxyXG4gICAgb3V0cHV0ICs9ICctJztcclxuICAgIGZvciAoaSA9IDA7IGkgPCAxMjsgaSsrKSB7XHJcbiAgICAgICAgb3V0cHV0ICs9IHJhbmRIZXgoKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gb3V0cHV0O1xyXG59XHJcblxyXG52YXIgZ2VuZXJhdG9ycyA9IHtcclxuICAgIHJhbmRIZXg6IHJhbmRIZXgsXHJcbiAgICBndWlkOiBndWlkXHJcbn07XHJcblxyXG5PYmplY3QuZnJlZXplKGdlbmVyYXRvcnMpO1xyXG5cclxubW9kdWxlLmV4cG9ydHMgPSBnZW5lcmF0b3JzOyIsIi8qZ2xvYmFsIGFuZ3VsYXIsIHJlcXVpcmUsIG1vZHVsZSovXHJcbi8qanNsaW50IGJyb3dzZXI6IHRydWUqL1xyXG5cclxudmFyIG1vZHVsZU5hbWUgPSAnQUJCLkhlbHBlcnMnO1xyXG5cclxudmFyIGFwcCA9IGFuZ3VsYXIubW9kdWxlKG1vZHVsZU5hbWUsIFtdKTtcclxuXHJcbmFwcC52YWx1ZSgnYWJiQXJyYXlIZWxwZXJzJywgcmVxdWlyZSgnLi9hcnJheUhlbHBlcnMuanMnKSk7XHJcbmFwcC52YWx1ZSgnYWJiR2VuZXJhdG9ycycsIHJlcXVpcmUoJy4vZ2VuZXJhdG9ycy5qcycpKTtcclxuXHJcbm1vZHVsZS5leHBvcnRzID0gbW9kdWxlTmFtZTsiLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4oZnVuY3Rpb24gYnJvd3NlcmlmeVNoaW0obW9kdWxlLCBkZWZpbmUpIHtcbihmdW5jdGlvbihtb2R1bGUpIHtcbnRyeSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIpOyB9XG5jYXRjaChlcnIpIHsgbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoXCJCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXNcIiwgW10pOyB9XG5tb2R1bGUucnVuKFtcIiR0ZW1wbGF0ZUNhY2hlXCIsIGZ1bmN0aW9uKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICR0ZW1wbGF0ZUNhY2hlLnB1dChcInNyYy90ZW1wbGF0ZXMvYWJiTGlzdC5odG1sXCIsXG4gICAgXCI8ZGl2IGNsYXNzPVxcXCJwYW5lbCBwYW5lbC1wcmltYXJ5XFxcIj5cXG5cIiArXG4gICAgXCIgICAgPGRpdiBjbGFzcz1cXFwicGFuZWwtaGVhZGluZ1xcXCI+PGlucHV0IGNsYXNzPVxcXCJoaWRkZW4taW5wdXRcXFwiIG5nLW1vZGVsPVxcXCJtb2RlbFtnZXRMaXN0TmFtZVByb3BlcnR5KCldXFxcIiAvPjwvZGl2PlxcblwiICtcbiAgICBcIiAgICA8ZGl2IGNsYXNzPVxcXCJsaXN0LWdyb3VwLWl0ZW1cXFwiIG5nLXJlcGVhdD1cXFwiKGluZGV4LCBpdGVtKSBpbiBnZXRMaXN0KCkgdHJhY2sgYnkgaXRlbVtnZXRJZFByb3BlcnR5KCldXFxcIiBuZy1pZj1cXFwiaW5kZXggIT0gZ2V0TGlzdE5hbWVQcm9wZXJ0eSgpXFxcIj5cXG5cIiArXG4gICAgXCIgICAgICAgIDxsaXN0LWl0ZW0gbmctbW9kZWw9XFxcIml0ZW1cXFwiIGRpc3BsYXktcHJvcGVydHk9XFxcInt7Z2V0RGlzcGxheVByb3BlcnR5KCl9fVxcXCI+PC9saXN0LWl0ZW0+XFxuXCIgK1xuICAgIFwiICAgIDwvZGl2PlxcblwiICtcbiAgICBcIjwvZGl2PlwiKTtcbn1dKTtcbn0pKCk7XG5cbihmdW5jdGlvbihtb2R1bGUpIHtcbnRyeSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIpOyB9XG5jYXRjaChlcnIpIHsgbW9kdWxlID0gYW5ndWxhci5tb2R1bGUoXCJCdWlsZGluZ0Jsb3guRGlyZWN0aXZlcy5UZW1wbGF0ZXNcIiwgW10pOyB9XG5tb2R1bGUucnVuKFtcIiR0ZW1wbGF0ZUNhY2hlXCIsIGZ1bmN0aW9uKCR0ZW1wbGF0ZUNhY2hlKSB7XG4gICR0ZW1wbGF0ZUNhY2hlLnB1dChcInNyYy90ZW1wbGF0ZXMvZHJhZ2dhYmxlTGlzdC5odG1sXCIsXG4gICAgXCI8ZGl2IGNsYXNzPVxcXCJkcmFnQXJlYVxcXCIgcmVtb3ZlPVxcXCJyZW1vdmVCeUlkXFxcIj5cXG5cIiArXG4gICAgXCIgICAgPGRpdiBjbGFzcz1cXFwicGFuZWwgcGFuZWwtcHJpbWFyeSBkcm9wQXJlYVxcXCIgb24tZHJvcD1cXFwiYWRkVG9MaXN0XFxcIj5cXG5cIiArXG4gICAgXCIgICAgICAgIDxkaXYgY2xhc3M9XFxcInBhbmVsLWhlYWRpbmdcXFwiPjxpbnB1dCBjbGFzcz1cXFwiaGlkZGVuLWlucHV0XFxcIiBuZy1tb2RlbD1cXFwibW9kZWxbZ2V0TGlzdE5hbWVQcm9wZXJ0eSgpXVxcXCIgLz48L2Rpdj5cXG5cIiArXG4gICAgXCIgICAgICAgIDxkaXYgY2xhc3M9XFxcImxpc3QtZ3JvdXAtaXRlbSBkcm9wQXJlYSBkcmFnZ2FibGVcXFwiIG9uLWRyb3A9XFxcImNyZWF0ZUFkZEJlZm9yZShpdGVtW2dldElkUHJvcGVydHkoKV0pXFxcIiBuZy1yZXBlYXQ9XFxcIihpbmRleCwgaXRlbSkgaW4gZ2V0TGlzdCgpIHRyYWNrIGJ5IGl0ZW1bZ2V0SWRQcm9wZXJ0eSgpXVxcXCIgbmctaWY9XFxcImluZGV4ICE9IGdldExpc3ROYW1lUHJvcGVydHkoKVxcXCI+XFxuXCIgK1xuICAgIFwiICAgICAgICAgICAgPGxpc3QtaXRlbSBuZy1tb2RlbD1cXFwiaXRlbVxcXCIgZGlzcGxheS1wcm9wZXJ0eT1cXFwie3tnZXREaXNwbGF5UHJvcGVydHkoKX19XFxcIj48L2xpc3QtaXRlbT5cXG5cIiArXG4gICAgXCIgICAgICAgIDwvZGl2PlxcblwiICtcbiAgICBcIiAgICA8L2Rpdj5cXG5cIiArXG4gICAgXCI8L2Rpdj5cIik7XG59XSk7XG59KSgpO1xuXG4oZnVuY3Rpb24obW9kdWxlKSB7XG50cnkgeyBtb2R1bGUgPSBhbmd1bGFyLm1vZHVsZShcIkJ1aWxkaW5nQmxveC5EaXJlY3RpdmVzLlRlbXBsYXRlc1wiKTsgfVxuY2F0Y2goZXJyKSB7IG1vZHVsZSA9IGFuZ3VsYXIubW9kdWxlKFwiQnVpbGRpbmdCbG94LkRpcmVjdGl2ZXMuVGVtcGxhdGVzXCIsIFtdKTsgfVxubW9kdWxlLnJ1bihbXCIkdGVtcGxhdGVDYWNoZVwiLCBmdW5jdGlvbigkdGVtcGxhdGVDYWNoZSkge1xuICAkdGVtcGxhdGVDYWNoZS5wdXQoXCJzcmMvdGVtcGxhdGVzL2xpc3RJdGVtLmh0bWxcIixcbiAgICBcIjxkaXY+e3tnZXRWYWx1ZSgpfX08L2Rpdj5cIik7XG59XSk7XG59KSgpO1xuXG59KS5jYWxsKGdsb2JhbCwgbW9kdWxlLCB1bmRlZmluZWQpO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSJdfQ==
