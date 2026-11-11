#!/usr/bin/env python3
"""prepboard desktop nudge for Linux: a pixel-art car tows a banner across the screen, right to left.

Uses GTK 3 through PyGObject (preinstalled on Ubuntu, Fedora and most desktops). The window is transparent
and clicks pass through it, except on the car and banner, which open prepboard.

    python3 nudge-car.py --title "COMPLETE LEETCODE" --subtitle "3 PROBLEMS LEFT TODAY" --seconds 11
"""
import argparse
import math
import subprocess
import time

import gi

gi.require_version("Gtk", "3.0")
gi.require_version("Gdk", "3.0")
import cairo  # noqa: E402
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

FONT = {
    "A": [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "B": ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
    "C": [" ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### "],
    "D": ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
    "E": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
    "F": ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
    "G": [" ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####"],
    "H": ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
    "I": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
    "J": ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
    "K": ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
    "L": ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
    "M": ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
    "N": ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
    "O": [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "P": ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
    "Q": [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
    "R": ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
    "S": [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
    "T": ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
    "U": ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
    "V": ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
    "W": ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
    "X": ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
    "Y": ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
    "Z": ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
    "0": [" ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### "],
    "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
    "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
    "3": ["#####", "   # ", "  #  ", "   # ", "    #", "#   #", " ### "],
    "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
    "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
    "6": ["  ## ", " #   ", "#    ", "#### ", "#   #", "#   #", " ### "],
    "7": ["#####", "    #", "   # ", "  #  ", " #   ", " #   ", " #   "],
    "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
    "9": [" ### ", "#   #", "#   #", " ####", "    #", "   # ", " ##  "],
    " ": ["     "] * 7,
    "-": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
    "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
    ".": ["     ", "     ", "     ", "     ", "     ", "     ", "  #  "],
    ":": ["     ", "  #  ", "     ", "     ", "     ", "  #  ", "     "],
    "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
    "'": ["  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "],
}

# Car facing left (it drives right to left): headlight on the left, tail light on the right.
CAR = [
    "............KKKKKKKKKKK.......",
    "...........KRRRRRRRRRRRK......",
    "..........KRWWWWKWWWWWRRK.....",
    ".........KRWwWWWKWwWWWWRRK....",
    "........KRRWWWWWKWWWWWWWRRK...",
    "...KKKKKRRRRRRRRRRRRRRRRRRRKK.",
    "..KYYRRRRRRRRRRRRRRRRRRRRRRRLK",
    "..KYYRRRRRRRRRRRRRRRRRRRRRRRLK",
    "..KRRRRrrrrrrrrrrrrrrrrrrrrRRK",
    "..KSSSrrrKKKKrrrrrrrrKKKKrrSSK",
    "...KKKKKGGGGKKKKKKKKKGGGGKKKK.",
    "......KGGggGGK.....KGGggGGK...",
    "......KGgggGGK.....KGgggGGK...",
    ".......KGGGGK.......KGGGGK....",
    "........KKKK.........KKKK.....",
]
CAR_COLORS = {
    "K": "#1B1B1F", "R": "#E8413C", "r": "#B52A2A", "W": "#9FD8FF", "w": "#FFFFFF",
    "Y": "#FFE066", "L": "#FF7A59", "S": "#C9CED6", "G": "#3A3A42", "g": "#9AA0AA",
}
ROPE = ["KK............KK", "..KK........KK..", "....KKKKKKKK...."]
BANNER_COLORS = {"K": "#1B1B1F", "B": "#FFF6DC", "b": "#EBDDB5", "E": "#9AA0AA"}
TEXT_COLORS = {"T": "#1B1B1F", "O": "#F29A13", "S": "#6B6658"}


def rgb(hex_color):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def layer(rows, colors, p):
    """Grid of characters -> list of (x, y, size, color) squares, plus width and height in pixels."""
    rects = []
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            if c in colors:
                rects.append((x * p, y * p, p, rgb(colors[c])))
    width = max((len(r) for r in rows), default=0) * p
    return rects, width, len(rows) * p


def text_rows(text, color_keys, bold=False):
    rows = [""] * 7
    for i, ch in enumerate(text):
        glyph = FONT.get(ch, FONT[" "])
        col = color_keys[i] if i < len(color_keys) else "T"
        for r in range(7):
            line = glyph[r].ljust(5)
            if bold:  # a pixel is on if it or its left neighbour is on (6 wide)
                line = "".join("#" if (x < 5 and line[x] == "#") or (x > 0 and line[x - 1] == "#") else " " for x in range(6))
            rows[r] += line.replace("#", col).replace(" ", ".") + "."
    return [r[:-1] for r in rows]


def banner_rows(w, h):
    rows = []
    for y in range(h):
        row = ""
        for x in range(w):
            edge_x, edge_y = x in (0, w - 1), y in (0, h - 1)
            if edge_x and edge_y:
                row += "."
            elif edge_x or edge_y:
                row += "K"
            elif x == 1 and y in (2, h - 3):
                row += "E"
            elif y == h - 2:
                row += "b"
            else:
                row += "B"
        rows.append(row)
    return rows


class NudgeCar:
    def __init__(self, title, subtitle, seconds, url):
        self.url = url
        self.seconds = seconds
        title = title.upper()
        keys = ["T"] * len(title)
        lc = title.find("LEETCODE")
        if lc >= 0:
            for i in range(lc, lc + 8):
                keys[i] = "O"

        self.car, self.car_w, self.car_h = layer(CAR, CAR_COLORS, 7)
        self.title, tw, th = layer(text_rows(title, keys, bold=True), TEXT_COLORS, 7)
        self.sub, sw, sh = ([], 0, 0)
        if subtitle:
            sub = subtitle.upper()
            self.sub, sw, sh = layer(text_rows(sub, "S" * len(sub)), TEXT_COLORS, 3)
        unit, pad = 6, 24
        content_w = max(tw, sw)
        content_h = th + (12 + sh if subtitle else 0)
        cells_w = math.ceil((content_w + 2 * pad) / unit)
        cells_h = math.ceil((content_h + 2 * pad) / unit)
        self.cloth, self.banner_w, self.banner_h = layer(banner_rows(cells_w, cells_h), BANNER_COLORS, unit)
        self.title_x = round((self.banner_w - tw) / 2 / unit) * unit
        self.title_y = pad
        self.sub_x = round((self.banner_w - sw) / 2 / 3) * 3
        self.sub_y = pad + th + 12
        self.rope, self.rope_w, _ = layer(ROPE, {"K": "#1B1B1F"}, 4)

        hitch = 6.5 * 7
        self.banner_top = hitch - self.banner_h / 2
        self.shift = max(0, -self.banner_top) + 8
        self.group_w = self.car_w + self.rope_w + self.banner_w
        self.group_h = max(self.car_h, self.banner_h) + self.shift + 12

        display = Gdk.Display.get_default()
        monitor = display.get_primary_monitor() or display.get_monitor(0)
        geo = monitor.get_geometry()
        self.screen_w = geo.width

        self.win = Gtk.Window(type=Gtk.WindowType.TOPLEVEL)
        self.win.set_title("prepboard nudge")
        self.win.set_decorated(False)
        self.win.set_app_paintable(True)
        self.win.set_keep_above(True)
        self.win.set_skip_taskbar_hint(True)
        self.win.set_skip_pager_hint(True)
        self.win.set_accept_focus(False)
        self.win.set_focus_on_map(False)
        self.win.set_type_hint(Gdk.WindowTypeHint.NOTIFICATION)

        screen = self.win.get_screen()
        visual = screen.get_rgba_visual()
        self.transparent = visual is not None and screen.is_composited()
        if self.transparent:
            self.win.set_visual(visual)
        # A strip across the top of the screen; it's transparent where nothing is drawn.
        self.win_h = int(self.group_h + 10)
        self.win.set_default_size(self.screen_w, self.win_h)
        self.win.move(geo.x, geo.y + int(geo.height * 0.14))

        area = Gtk.DrawingArea()
        area.connect("draw", self.on_draw)
        area.add_events(Gdk.EventMask.BUTTON_PRESS_MASK)
        area.connect("button-press-event", self.on_click)
        self.win.add(area)
        self.area = area
        self.win.connect("realize", lambda *_: self.update_input_region())
        self.win.show_all()

        self.start = time.monotonic()
        GLib.timeout_add(16, self.tick)
        GLib.timeout_add_seconds(int(seconds) + 4, Gtk.main_quit)  # safety net

    def x(self):
        progress = (time.monotonic() - self.start) / self.seconds
        return self.screen_w - progress * (self.screen_w + self.group_w)

    def update_input_region(self):
        # Clicks pass through everywhere except the car and banner.
        gdk_window = self.win.get_window()
        if gdk_window is None:
            return
        x = int(self.x())
        region = cairo.Region(cairo.RectangleInt(max(0, x), 0, max(1, min(self.group_w, self.screen_w - x)), int(self.group_h)))
        self.win.input_shape_combine_region(region)

    def tick(self):
        if self.x() < -self.group_w:
            Gtk.main_quit()
            return False
        self.update_input_region()
        self.area.queue_draw()
        return True

    def draw_layer(self, cr, rects, ox, oy):
        for x, y, s, color in rects:
            cr.set_source_rgb(*color)
            cr.rectangle(ox + x, oy + y, s, s)
            cr.fill()

    def on_draw(self, _widget, cr):
        cr.set_operator(cairo.OPERATOR_SOURCE)
        if self.transparent:
            cr.set_source_rgba(0, 0, 0, 0)
        else:
            cr.set_source_rgb(0.05, 0.05, 0.045)  # no compositor: dark strip instead of transparent
        cr.paint()
        cr.set_operator(cairo.OPERATOR_OVER)
        cr.set_antialias(cairo.ANTIALIAS_NONE)

        t = time.monotonic() - self.start
        gx = self.x()
        bob = -3 * abs(math.sin(t * math.pi / 0.17))
        flap = math.radians(0.2 + 1.4 * math.sin(t * math.pi / 0.42))

        hitch = 6.5 * 7
        self.draw_layer(cr, self.rope, gx + self.car_w - 2, self.shift + hitch - 2)

        bx, by = gx + self.car_w + self.rope_w - 4, self.shift + self.banner_top
        # Hard pixel shadow behind the banner.
        cr.set_source_rgba(0, 0, 0, 0.3)
        cr.rectangle(bx + 6, by + 6, self.banner_w, self.banner_h)
        cr.fill()
        cr.save()
        cr.translate(bx, by + self.banner_h / 2)
        cr.transform(cairo.Matrix(1, math.tan(flap), 0, 1, 0, 0))  # banner flaps in the wind
        cr.translate(0, -self.banner_h / 2)
        self.draw_layer(cr, self.cloth, 0, 0)
        self.draw_layer(cr, self.title, self.title_x, self.title_y)
        self.draw_layer(cr, self.sub, self.sub_x, self.sub_y)
        cr.restore()

        self.draw_layer(cr, self.car, gx, self.shift + bob)
        return False

    def on_click(self, *_):
        try:
            subprocess.Popen(["xdg-open", self.url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except OSError:
            pass
        Gtk.main_quit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--title", default="COMPLETE LEETCODE")
    parser.add_argument("--subtitle", default="")
    parser.add_argument("--seconds", type=float, default=11)
    parser.add_argument("--url", default="https://prepboard.aravindc.dev")
    args = parser.parse_args()
    NudgeCar(args.title, args.subtitle, args.seconds, args.url)
    try:
        subprocess.Popen(["canberra-gtk-play", "-i", "message"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        pass
    Gtk.main()


if __name__ == "__main__":
    main()
