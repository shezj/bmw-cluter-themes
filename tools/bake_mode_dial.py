#!/usr/bin/env python3
"""Bake Apex's bottom-edge mode dial as four antialiased RGBA states.

Run: uv run -q --with pillow python tools/bake_mode_dial.py
Artwork is drawn from native geometry and bundled fonts, not a photo crop.
The car only uploads the selected face when the reported mode changes;
the moving white indicator is drawn separately by the renderer.
"""
import base64
import json
import math
import os
import zlib

from cluster_source import cluster_app

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE = (420, 160)
SCALE = 3
CENTRE = (210, 210)  # Below the crop: the dial hugs the custom face's lower edge.
RIM_RADIUS = 194
RIM_STROKE = 3
LABEL_RADIUS = 165
LABEL_WIDTH_SCALE = 0.72  # Condensed proportions keep SPORT PLUS inside its visible arc.
MODES = [('COMFORT', -46), ('SPORT', 0), ('SPORT PLUS', 46)]
WHITE = (244, 246, 255, 255)
RED = (255, 40, 24, 255)


def point(radius, angle):
    radians = math.radians(angle)
    return ((CENTRE[0] + math.sin(radians) * radius) * SCALE,
            (CENTRE[1] - math.cos(radians) * radius) * SCALE)


def arc(radius, start=-90, end=90):
    steps = max(1, math.ceil(abs(end - start)))
    return [point(radius, start + (end - start) * index / steps) for index in range(steps + 1)]


def rim_points():
    """Three broad, flat-topped gear shoulders joined by curved sections."""
    points = []
    angle = -84
    for _, centre_angle in MODES:
        start = centre_angle - 10
        points.extend(arc(RIM_RADIUS, angle, start))
        points.extend([point(205, centre_angle - 7), point(205, centre_angle + 7),
                       point(RIM_RADIUS, centre_angle + 10)])
        angle = centre_angle + 10
    points.extend(arc(RIM_RADIUS, angle, 84))
    return points


def label_glyph(character, font, colour):
    bounds = font.getbbox(character)
    padding = 2 * SCALE
    glyph = Image.new('RGBA', (bounds[2] - bounds[0] + padding * 2,
                               bounds[3] - bounds[1] + padding * 2))
    ImageDraw.Draw(glyph).text((padding - bounds[0], padding - bounds[1]), character, font=font, fill=colour)
    return glyph.resize((round(glyph.width * LABEL_WIDTH_SCALE), glyph.height), Image.Resampling.LANCZOS)


def label(image, text, angle, selected):
    font = ImageFont.truetype(os.path.join(ROOT, 'tools', 'fonts-src', 'Orbitron[wght].ttf'), 24 * SCALE)
    font.set_variation_by_name('Black' if selected else 'Regular')
    width = font.getlength(text) * LABEL_WIDTH_SCALE
    for index, character in enumerate(text):
        if character == ' ':
            continue
        start = font.getlength(text[:index]) * LABEL_WIDTH_SCALE
        end = font.getlength(text[:index + 1]) * LABEL_WIDTH_SCALE
        distance = (start + end - width) / 2
        glyph_angle = angle + math.degrees(distance / (LABEL_RADIUS * SCALE))
        # Each letter sits on the circular baseline and follows its own tangent.
        glyph = label_glyph(character, font, RED if selected else WHITE)
        glyph = glyph.rotate(-glyph_angle, resample=Image.Resampling.BICUBIC, expand=True)
        x, y = point(LABEL_RADIUS, glyph_angle)
        image.alpha_composite(glyph, (round(x - glyph.width / 2), round(y - glyph.height / 2)))


def paint(selected):
    image = Image.new('RGBA', (SIZE[0] * SCALE, SIZE[1] * SCALE))
    draw = ImageDraw.Draw(image)
    rim = rim_points()
    draw.polygon(rim + [(CENTRE[0] * SCALE, CENTRE[1] * SCALE)], fill=(0, 0, 0, 150))
    for angle in range(-85, 86, 5):
        draw.line([point(138, angle), point(188, angle)], fill=(170, 176, 190, 35), width=2 * SCALE)

    glow = Image.new('RGBA', image.size)
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.line(rim, fill=(255, 30, 15, 180), width=5 * SCALE, joint='curve')
    glow_draw.line(arc(112), fill=(255, 30, 15, 160), width=13 * SCALE)
    image = Image.alpha_composite(image, glow.filter(ImageFilter.GaussianBlur(2 * SCALE)))
    draw = ImageDraw.Draw(image)
    draw.line(rim, fill=RED, width=RIM_STROKE * SCALE, joint='curve')
    draw.line(arc(112), fill=RED, width=11 * SCALE)
    draw.line(arc(112), fill=WHITE, width=6 * SCALE)
    for angle in range(-85, 86, 5):
        x, y = point(126, angle)
        radius = 1.8 * SCALE
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=WHITE)

    for index, (text, angle) in enumerate(MODES):
        label(image, text, angle, index == selected)
    return image.resize(SIZE, Image.Resampling.LANCZOS)


def main():
    states = [base64.b64encode(zlib.compress(paint(selected).tobytes(), 9)).decode('ascii')
              for selected in (-1, 0, 1, 2)]
    result = {'width': SIZE[0], 'height': SIZE[1], 'states': states,
              'marker': {'centre': CENTRE, 'radius': 140, 'halfAngle': 12,
                         'angles': [angle for _, angle in MODES], 'dots': [126, 5, 1.8]}}
    output = cluster_app(ROOT) / 'hud/assets/apex_mode_dial.json'
    with open(output, 'w') as file:
        json.dump(result, file, separators=(',', ':'))
    print('Apex mode dial: %dx%d, unknown / Comfort / Sport / Sport Plus' % SIZE)


if __name__ == '__main__':
    main()
