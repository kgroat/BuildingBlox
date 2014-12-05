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