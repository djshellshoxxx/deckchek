// Self-authored DeckChek test fixture: an opaque third-party script that DeckChek must keep unchanged and never run.
var FixtureCtl = {};
FixtureCtl.init = function () { throw new Error('DeckChek must never execute imported scripts'); };
FixtureCtl.wheelTurn = function (channel, control, value) { return value; };
FixtureCtl.beatFxSelect = function () {};
