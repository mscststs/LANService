#!/usr/bin/env python3
"""uinput 输入守护进程 — 鼠标 + 键盘事件注入"""
import sys, json
from evdev import UInput, InputEvent, ecodes

# 键名 → Linux input key code 映射
KEY_MAP = {
    # 字母
    'a': 30, 'b': 48, 'c': 46, 'd': 32, 'e': 18, 'f': 33, 'g': 34,
    'h': 35, 'i': 23, 'j': 36, 'k': 37, 'l': 38, 'm': 50, 'n': 49,
    'o': 24, 'p': 25, 'q': 16, 'r': 19, 's': 31, 't': 20, 'u': 22,
    'v': 47, 'w': 17, 'x': 45, 'y': 21, 'z': 44,
    # 数字
    '0': 11, '1': 2, '2': 3, '3': 4, '4': 5, '5': 6, '6': 7, '7': 8,
    '8': 9, '9': 10,
    # 修饰键
    'command': 125, 'cmd': 125, 'super': 125, 'win': 125,  # KEY_LEFTMETA
    'alt': 56, 'option': 56,                                 # KEY_LEFTALT
    'control': 29, 'ctrl': 29,                               # KEY_LEFTCTRL
    'shift': 42,                                              # KEY_LEFTSHIFT
    # 功能键
    'tab': 15, 'escape': 1, 'esc': 1,
    'enter': 28, 'return': 28,
    'space': 57, 'backspace': 14, 'delete': 111,
    'up': 103, 'down': 108, 'left': 105, 'right': 106,
    'home': 102, 'end': 107,
    'pageup': 104, 'pagedown': 109,
    # F键
    'f1': 59, 'f2': 60, 'f3': 61, 'f4': 62, 'f5': 63, 'f6': 64,
    'f7': 65, 'f8': 66, 'f9': 67, 'f10': 68, 'f11': 87, 'f12': 88,
    # 符号
    'minus': 12, 'equal': 13,
    'leftbrace': 26, 'rightbrace': 27,
    'backslash': 43, 'semicolon': 39, 'quote': 40,
    'comma': 51, 'period': 52, 'slash': 53,
    # 媒体键
    'audio_pause': 119, 'audio_play': 207, 'audio_stop': 128,
    'audio_prev': 165, 'audio_next': 163,
    'audio_mute': 113, 'audio_voldown': 114, 'audio_volup': 115,
}


def resolve_key_codes(keys):
    """将键名字符串列表转换为 Linux input key codes"""
    codes = []
    for k in keys:
        if isinstance(k, int):
            codes.append(k)
        else:
            code = KEY_MAP.get(str(k).lower())
            if code is None:
                raise ValueError(f'Unknown key: {k}')
            codes.append(code)
    return codes


def main():
    try:
        # 创建虚拟输入设备（鼠标 + 键盘）
        device = UInput(
            events={
                ecodes.EV_REL: [ecodes.REL_X, ecodes.REL_Y,
                                ecodes.REL_WHEEL, ecodes.REL_HWHEEL],
                ecodes.EV_KEY: [
                    ecodes.BTN_LEFT, ecodes.BTN_RIGHT, ecodes.BTN_MIDDLE,
                    *KEY_MAP.values(),  # 所有键盘按键
                ],
            },
            name='LANService Virtual Input',
        )
    except Exception as e:
        sys.stdout.write(json.dumps({'error': str(e)}) + '\n')
        sys.stdout.flush()
        sys.exit(1)

    sys.stdout.write('READY\n')
    sys.stdout.flush()

    def ev(typ, code, value):
        return InputEvent(0, 0, typ, code, value)

    try:
        while True:
            line = sys.stdin.readline()
            if not line:
                break
            try:
                cmd = json.loads(line.strip())
            except json.JSONDecodeError:
                continue

            action = cmd.get('action', '')

            # ---- 鼠标移动 ----
            if action == 'move':
                dx = int(cmd.get('dx', 0))
                dy = int(cmd.get('dy', 0))
                if dx != 0:
                    device.write_event(ev(ecodes.EV_REL, ecodes.REL_X, dx))
                if dy != 0:
                    device.write_event(ev(ecodes.EV_REL, ecodes.REL_Y, dy))
                if dx != 0 or dy != 0:
                    device.syn()
                sys.stdout.write('OK\n')

            # ---- 鼠标点击 ----
            elif action == 'click':
                btn_map = {
                    'left': ecodes.BTN_LEFT,
                    'right': ecodes.BTN_RIGHT,
                    'middle': ecodes.BTN_MIDDLE,
                }
                btn = btn_map.get(cmd.get('btn', 'left'), ecodes.BTN_LEFT)
                device.write_event(ev(ecodes.EV_KEY, btn, 1))
                device.syn()
                device.write_event(ev(ecodes.EV_KEY, btn, 0))
                device.syn()
                if cmd.get('double'):
                    device.write_event(ev(ecodes.EV_KEY, btn, 1))
                    device.syn()
                    device.write_event(ev(ecodes.EV_KEY, btn, 0))
                    device.syn()
                sys.stdout.write('OK\n')

            # ---- 滚动 ----
            elif action == 'scroll':
                dx = int(cmd.get('dx', 0))
                dy = int(cmd.get('dy', 0))
                if dy != 0:
                    device.write_event(ev(ecodes.EV_REL, ecodes.REL_WHEEL, dy))
                if dx != 0:
                    device.write_event(ev(ecodes.EV_REL, ecodes.REL_HWHEEL, dx))
                if dx != 0 or dy != 0:
                    device.syn()
                sys.stdout.write('OK\n')

            # ---- 键盘按下 ----
            elif action == 'keydown':
                codes = resolve_key_codes(cmd.get('keys', []))
                for code in codes:
                    device.write_event(ev(ecodes.EV_KEY, code, 1))
                device.syn()
                sys.stdout.write('OK\n')

            # ---- 键盘释放 ----
            elif action == 'keyup':
                codes = resolve_key_codes(cmd.get('keys', []))
                for code in codes:
                    device.write_event(ev(ecodes.EV_KEY, code, 0))
                device.syn()
                sys.stdout.write('OK\n')

            # ---- 组合键（按下 → 释放）----
            elif action == 'keypress':
                codes = resolve_key_codes(cmd.get('keys', []))
                for code in codes:
                    device.write_event(ev(ecodes.EV_KEY, code, 1))
                device.syn()
                for code in reversed(codes):
                    device.write_event(ev(ecodes.EV_KEY, code, 0))
                device.syn()
                sys.stdout.write('OK\n')

            # ---- 退出 ----
            elif action == 'quit':
                sys.stdout.write('BYE\n')
                break

            sys.stdout.flush()

    except KeyboardInterrupt:
        pass
    except BrokenPipeError:
        pass
    finally:
        device.close()


if __name__ == '__main__':
    main()
