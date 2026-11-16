'use strict';

// Uniform animations only: the same keyframes as cluster-render's protocol.
// Shared by server validation, browser playback and bench tests.
const BenchAnimations = (() => {
    function parse(keys) {
        if (typeof keys !== 'string' || !keys.trim()) throw new Error('animation needs keyframes');
        const frames = keys.trim().split(/\s+/).map((key) => {
            const parts = key.split(':');
            if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('invalid animation key');
            return { time: Number(parts[0]), values: parts[1].split(',').map(Number) };
        });
        if (frames.length > 256) throw new Error('too many animation keys');
        const width = frames[0].values.length;
        if ([1, 3, 4].indexOf(width) < 0) throw new Error('animation uniform requires 1, 3 or 4 values');
        frames.forEach((frame, index) => {
            if (!Number.isFinite(frame.time) || frame.time < 0 ||
                (index && frame.time <= frames[index - 1].time) ||
                frame.values.length !== width || !frame.values.every(Number.isFinite)) {
                throw new Error('invalid animation times or values');
            }
        });
        return frames;
    }

    function active(animation, now) {
        const end = animation.frames[animation.frames.length - 1].time;
        return !!animation.loop || now - animation.startedAt < end;
    }

    function sample(animation, now) {
        const frames = animation.frames, end = frames[frames.length - 1].time;
        let time = Math.max(0, now - animation.startedAt);
        if (animation.loop && end > 0) time %= end;
        if (time <= frames[0].time) return frames[0].values;
        for (let index = 1; index < frames.length; index++) {
            const next = frames[index], previous = frames[index - 1];
            if (time >= next.time) continue;
            if (animation.interp === 'step') return previous.values;
            const fraction = (time - previous.time) / (next.time - previous.time);
            return previous.values.map((value, lane) => value + (next.values[lane] - value) * fraction);
        }
        return frames[frames.length - 1].values;
    }

    return { parse, active, sample };
})();

if (typeof module !== 'undefined') module.exports = BenchAnimations;
