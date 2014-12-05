/*global angular, require, module, jQuery, interact, Exception*/
/*jslint browser: true*/

//var jQueryExists = false;
//if (typeof jQuery === 'function') {
//    jQueryExists = true;
//}


var draggedElements = [];
var draggedElementsMouseUpCallers = [];

var initialized = false;
var dragStart = 'dragStart';
var dragEnd = 'dragEnd';
var drag = 'drag';
var drop = 'drop';

var initializeDragDrop = function () {
    'use strict';
    if (initialized) {
        return;
    }
    if (window.navigator.msPointerEnabled) {
        document.addEventListener('pointerup', function (ev) {
            while (draggedElementsMouseUpCallers.length > 0) {
                draggedElementsMouseUpCallers.pop()(ev);
            }
        });
    } else {
        document.body.addEventListener('mouseup', function (ev) {
            while (draggedElementsMouseUpCallers.length > 0) {
                draggedElementsMouseUpCallers.pop()(ev);
            }
        });
    }
};

var arrayCopy = function (original) {
    'use strict';
    var newList = [],
        index;
    for (index in original) {
        if (original.hasOwnProperty(index)) {
            newList.push(original[index]);
        }
    }
};

function Point(options) {
    'use strict';
    this.x = options.x;
    this.y = options.y;
}

function DragEvent(options) {
    'use strict';
    var type = options.type || 'drag',
        self = document.createEvent('CustomEvent');
    self.initCustomEvent(type, false, false, options);
    return self;
}

function DropEvent(options) {
    'use strict';
    var type = options.type || 'drop',
        self = document.createEvent('CustomEvent');
    self.initCustomEvent(type, false, false, options);
    return self;
}

function Draggable(options) {
    'use strict';
    var el = options.el,
        dragging = false,
        mouseDown = 0,
        self = this;

    initializeDragDrop();

    if (window.navigator.msPointerEnabled) {
        el.addEventListener('pointerdown', function (ev) {
            mouseDown += 1;
            ev.preventDefault();
            draggedElementsMouseUpCallers.push(function (ev) {
                mouseDown -= 1;
                if (mouseDown === 0) {
                    if (dragging) {
                        self.fireEvent(new DragEvent({
                            type: dragEnd,
                            position: new Point({
                                x: ev.clientX + window.scrollX,
                                y: ev.clientY + window.scrollY
                            })
                        }));
                        draggedElements.splice(draggedElements.indexOf(self), 1);
                        dragging = false;
                    } else {
                        self.fireEvent(new DropEvent({
                            position: new Point({
                                x: ev.clientX + window.scrollX,
                                y: ev.clientY + window.scrollY
                            }),
                            draggedElements: arrayCopy(draggedElements)
                        }));
                    }
                }
            });
            return false;
        });
        el.addEventListener('pointermove', function (ev) {
            ev.preventDefault();
            if (mouseDown === 0) {
                return;
            }
            if (!dragging) {
                self.fireEvent(new DragEvent({
                    type: dragStart,
                    position: new Point({
                        x: ev.clientX + window.scrollX,
                        y: ev.clientY + window.scrollY
                    })
                }));
            }
            dragging = true;
            self.fireEvent(new DragEvent({
                type: drag,
                position: new Point({
                    x: ev.clientX + window.scrollX,
                    y: ev.clientY + window.scrollY
                })
            }));
            return false;
        });
    } else {
        el.addEventListener('mousedown', function () {
            mouseDown += 1;
            draggedElementsMouseUpCallers.push(function (ev) {
                mouseDown -= 1;
                if (mouseDown === 0) {
                    if (dragging) {
                        self.fireEvent(new DragEvent({
                            type: dragEnd,
                            position: new Point({
                                x: ev.clientX + window.scrollX,
                                y: ev.clientY + window.scrollY
                            })
                        }));
                        draggedElements.splice(draggedElements.indexOf(self), 1);
                        dragging = false;
                    } else {
                        self.fireEvent(new DropEvent({
                            position: new Point({
                                x: ev.clientX + window.scrollX,
                                y: ev.clientY + window.scrollY
                            }),
                            draggedElements: arrayCopy(draggedElements)
                        }));
                    }
                }
            });
        });
        el.addEventListener('mousemove', function (ev) {
            if (mouseDown === 0) {
                return;
            }
            if (!dragging) {
                self.fireEvent(new DragEvent({
                    type: dragStart,
                    position: new Point({ x: ev.clientX + window.scrollX, y: ev.clientY + window.scrollY })
                }));
            }
            dragging = true;
            self.fireEvent(new DragEvent({
                type: drag,
                position: new Point({ x: ev.clientX + window.scrollX, y: ev.clientY + window.scrollY })
            }));
        });
        el.addEventListener('touchstart', function (ev) {
            mouseDown += ev.changedTouches.length;
        });
        el.addEventListener('touchend', function (ev) {
            var meanX = 0,
                meanY = 0,
                index,
                targetTouch;
            mouseDown -= ev.changedTouches.length;
            if (mouseDown === 0) {
                for (index in ev.targetTouches) {
                    if (ev.targetTouches.hasOwnProperty(index)) {
                        targetTouch = ev.targetTouches[index];
                        meanX += targetTouch.pageX;
                        meanY += targetTouch.pageY;
                    }
                }
                meanX /= ev.targetTouches.length;
                meanY /= ev.targetTouches.length;
                if (dragging) {
                    self.fireEvent(new DragEvent({
                        type: dragEnd,
                        position: new Point({
                            x: meanX,
                            y: meanY
                        })
                    }));
                    draggedElements.splice(draggedElements.indexOf(self), 1);
                    dragging = false;
                } else {
                    self.fireEvent(new DropEvent({
                        position: new Point({
                            x: meanX,
                            y: meanY
                        }),
                        draggedElements: arrayCopy(draggedElements)
                    }));
                }
            }
        });
        el.addEventListener('touchmove', function (ev) {
            var meanX = 0,
                meanY = 0,
                index,
                targetTouch;
            if (mouseDown === 0) {
                return;
            }
            for (index in ev.targetTouches) {
                if (ev.targetTouches.hasOwnProperty(index)) {
                    targetTouch = ev.targetTouches[index];
                    meanX += targetTouch.pageX;
                    meanY += targetTouch.pageY;
                }
            }
            meanX /= ev.targetTouches.length;
            meanY /= ev.targetTouches.length;
            if (!dragging) {
                self.fireEvent(new DragEvent({
                    type: dragStart,
                    position: new Point({ x: meanX, y: meanY })
                }));
            }
            dragging = true;

            self.fireEvent(new DragEvent({
                type: drag,
                position: new Point({ x: meanX, y: meanY })
            }));
        });
    }

    this.fireEvent = this.dispatchEvent = function (event) {
        el.dispatchEvent(event);
        return this;
    };

    this.on = this.addEventListener = function (eventName, eventOptions) {
        var handler;
        if (typeof eventName !== 'string') {
            throw new Exception("Event Name must be a string");
        }
        if (typeof eventOptions === 'function') {
            handler = eventOptions;
            eventOptions = {};
        } else if (typeof eventOptions === 'object') {
            handler = eventOptions.handler;
        }

        if (typeof handler !== 'function') {
            throw new Exception("No Event Handler registered");
        }
        el.addEventListener(eventName, handler);
        return this;
    };
}

function draggable(element) {
    'use strict';
    var drag;
    drag = new Draggable({
        el: element
    });

    return drag;
}

module.exports = draggable;