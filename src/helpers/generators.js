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