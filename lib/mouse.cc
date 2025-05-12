#include "mouse.h"
#include <dwmapi.h>
#pragma comment(lib, "dwmapi.lib")

const char* LEFT_DOWN = "left-down";
const char* LEFT_UP = "left-up";
const char* RIGHT_DOWN = "right-down";
const char* RIGHT_UP = "right-up";
const char* MIDDLE_DOWN = "middle-down";
const char* MIDDLE_UP = "middle-up";
const char* MOVE = "move";
const char* WHEEL_DOWN = "wheel-down";
const char* WHEEL_UP = "wheel-up";
const char* LEFT_DRAG = "left-drag";
const char* RIGHT_DRAG = "right-drag";
const char* MIDDLE_DRAG = "middle-drag";

bool IsMouseEvent(WPARAM type) {
	return type == WM_LBUTTONDOWN ||
		type == WM_LBUTTONUP ||
		type == WM_RBUTTONDOWN ||
		type == WM_RBUTTONUP ||
		type == WM_MBUTTONDOWN ||
		type == WM_MBUTTONUP ||
		type == WM_MOUSEMOVE ||
		type == WM_MOUSEHWHEEL ||
		type == WM_MOUSEWHEEL;
}

void OnMouseEvent(WPARAM type, POINT point, void* data) {
	Mouse* mouse = (Mouse*) data;
	mouse->HandleEvent(type, point);
}

NAUV_WORK_CB(OnSend) {
	Mouse* mouse = (Mouse*) async->data;
	mouse->HandleSend();
}

void OnClose(uv_handle_t* handle) {
	uv_async_t* async = (uv_async_t*) handle;
	delete async;
}

// https://stackoverflow.com/a/76957105
bool GetWindowRectNoInvisibleBorders(HWND hWnd, RECT* rect) {
		RECT dwmRect;
		HRESULT hresult = DwmGetWindowAttribute(hWnd, DWMWA_EXTENDED_FRAME_BOUNDS, &dwmRect, sizeof(RECT));
		if (hresult != S_OK) return false;

		HMONITOR monitor = MonitorFromWindow(hWnd, MONITOR_DEFAULTTONEAREST);
		MONITORINFOEX monInfo;
		monInfo.cbSize = sizeof(MONITORINFOEX);
		GetMonitorInfo(monitor, &monInfo);

		DEVMODE monDeviceConfig;
		monDeviceConfig.dmSize = sizeof(DEVMODE);
		EnumDisplaySettings(monInfo.szDevice, ENUM_CURRENT_SETTINGS, &monDeviceConfig);

		auto scalingRatio = (monInfo.rcMonitor.right - monInfo.rcMonitor.left) / (double)monDeviceConfig.dmPelsWidth;
		rect->left = (dwmRect.left - monDeviceConfig.dmPosition.x) * scalingRatio + monInfo.rcMonitor.left;
		rect->right = (dwmRect.right - monDeviceConfig.dmPosition.x) * scalingRatio + monInfo.rcMonitor.left;
		rect->top = (dwmRect.top - monDeviceConfig.dmPosition.y) * scalingRatio + monInfo.rcMonitor.top;
		rect->bottom = (dwmRect.bottom - monDeviceConfig.dmPosition.y) * scalingRatio + monInfo.rcMonitor.top;

		return true;
}

Nan::Persistent<Function> Mouse::constructor;

Mouse::Mouse(Nan::Callback* callback) {
	async = new uv_async_t;
	async->data = this;

	for (size_t i = 0; i < BUFFER_SIZE; i++) {
		eventBuffer[i] = new MouseEvent();
	}

	event_callback = callback;
	async_resource = new Nan::AsyncResource("win-mouse:Mouse");
	hwnd = GetForegroundWindow();

	uv_async_init(uv_default_loop(), async, OnSend);
	uv_mutex_init(&lock);

	hook_ref = MouseHookRegister(OnMouseEvent, this);
}

Mouse::~Mouse() {
	Stop();
	uv_mutex_destroy(&lock);
	delete event_callback;

	// HACK: Sometimes deleting async resource segfaults.
	// Probably related to https://github.com/nodejs/nan/issues/772
	if (!Nan::GetCurrentContext().IsEmpty()) {
		delete async_resource;
	}

	for (size_t i = 0; i < BUFFER_SIZE; i++) {
		delete eventBuffer[i];
	}
}

void Mouse::Initialize(Local<Object> exports, Local<Value> module, Local<Context> context) {
	Nan::HandleScope scope;

	Local<FunctionTemplate> tpl = Nan::New<FunctionTemplate>(Mouse::New);
	tpl->SetClassName(Nan::New<String>("Mouse").ToLocalChecked());
	tpl->InstanceTemplate()->SetInternalFieldCount(1);

	Nan::SetPrototypeMethod(tpl, "destroy", Mouse::Destroy);
	Nan::SetPrototypeMethod(tpl, "ref", Mouse::AddRef);
	Nan::SetPrototypeMethod(tpl, "unref", Mouse::RemoveRef);

	Mouse::constructor.Reset(Nan::GetFunction(tpl).ToLocalChecked());
	exports->Set(context,
		Nan::New("Mouse").ToLocalChecked(),
		Nan::GetFunction(tpl).ToLocalChecked());
}

void Mouse::Stop() {
	uv_mutex_lock(&lock);

	if (!stopped) {
		stopped = true;
		MouseHookUnregister(hook_ref);
		uv_close((uv_handle_t*) async, OnClose);
	}

	uv_mutex_unlock(&lock);
}

void Mouse::HandleEvent(WPARAM type, POINT point) {
	if(!IsMouseEvent(type) || stopped) return;

	uv_mutex_lock(&lock);

	if (!stopped) {
		eventBuffer[writeIndex]->point = point;
		eventBuffer[writeIndex]->type = type;
		writeIndex = (writeIndex + 1) % BUFFER_SIZE;
		uv_async_send(async);
	}

	uv_mutex_unlock(&lock);
}

void Mouse::HandleSend() {
	Nan::HandleScope scope;

	uv_mutex_lock(&lock);

	while (readIndex != writeIndex && !stopped) {
		MouseEvent e = {
			eventBuffer[readIndex]->point,
			eventBuffer[readIndex]->type
		};
		readIndex = (readIndex + 1) % BUFFER_SIZE;
		const char* name;

		if (e.type == WM_LBUTTONDOWN) {
			leftPressed = true;
			name = LEFT_DOWN;
		} else if (e.type == WM_LBUTTONUP) {
			leftPressed = false;
			name = LEFT_UP;
		} else if (e.type == WM_RBUTTONDOWN) {
			rightPressed = true;
			name = RIGHT_DOWN;
		} else if (e.type == WM_RBUTTONUP) {
			rightPressed = false;
			name = RIGHT_UP;
		} else if (e.type == WM_MBUTTONDOWN) {
			middlePressed = true;
			name = MIDDLE_DOWN;
		} else if (e.type == WM_MBUTTONUP) {
			middlePressed = false;
			name = MIDDLE_UP;
		} else if (e.type == WM_MOUSEMOVE) {
			if (leftPressed) {
				name = LEFT_DRAG;
			} else if (rightPressed) {
				name = RIGHT_DRAG;
			} else if (middlePressed) {
				name = MIDDLE_DRAG;
			} else {
				name = MOVE;
			}
		} else if (e.type == WM_MOUSEHWHEEL) {
			name = WHEEL_DOWN;
		} else if (e.type == WM_MOUSEWHEEL)  {
			name = WHEEL_UP;
		}

		POINT cursorPoint = e.point;
		bool isOutside = true;
		bool isWindowDrag = false;
		RECT rect = {0};

		if (hwnd != NULL) {
			wchar_t className[256] = {0};
			HWND _hwnd = hwnd;
			GetClassNameW(hwnd, className, 256);
			if (wcscmp(className, L"Chrome_WidgetWin_1") == 0) {
				HWND realHwnd = FindWindowExW(hwnd, NULL, L"Chrome_RenderWidgetHostHWND", NULL);
				if (realHwnd != NULL) {
					_hwnd = realHwnd;
				}
			}

			if (IsWindowVisible(_hwnd)) {
				if (!GetWindowRectNoInvisibleBorders(_hwnd, &rect)) {
					GetWindowRect(_hwnd, &rect);
				}

				if (PtInRect(&rect, cursorPoint)) isOutside = false;
				cursorPoint.x -= rect.left;
				cursorPoint.y -= rect.top;

				if (name == LEFT_DRAG && !isOutside) {
					if (oldRect.left != rect.left || oldRect.top != rect.top || oldIsWindowDrag) {
						isWindowDrag = true;
					}
				}
			}
		}

		oldIsWindowDrag = isWindowDrag;
		oldRect = rect;

		Local<Object> obj = Nan::New<Object>();
		obj->Set(Nan::GetCurrentContext(), Nan::New("type").ToLocalChecked(), Nan::New<String>(name).ToLocalChecked());
		obj->Set(Nan::GetCurrentContext(), Nan::New("x").ToLocalChecked(), Nan::New<Number>(e.point.x));
		obj->Set(Nan::GetCurrentContext(), Nan::New("y").ToLocalChecked(), Nan::New<Number>(e.point.y));

		Local<Object> windowObj = Nan::New<Object>();
		windowObj->Set(Nan::GetCurrentContext(), Nan::New("handle").ToLocalChecked(), Nan::New<Number>(reinterpret_cast<uintptr_t>(hwnd)));
		windowObj->Set(Nan::GetCurrentContext(), Nan::New("left").ToLocalChecked(), Nan::New<Number>(rect.left));
		windowObj->Set(Nan::GetCurrentContext(), Nan::New("top").ToLocalChecked(), Nan::New<Number>(rect.top));
		windowObj->Set(Nan::GetCurrentContext(), Nan::New("right").ToLocalChecked(), Nan::New<Number>(rect.right));
		windowObj->Set(Nan::GetCurrentContext(), Nan::New("bottom").ToLocalChecked(), Nan::New<Number>(rect.bottom));

		Local<Object> mouseObj = Nan::New<Object>();
		mouseObj->Set(Nan::GetCurrentContext(), Nan::New("x").ToLocalChecked(), Nan::New<Number>(cursorPoint.x));
		mouseObj->Set(Nan::GetCurrentContext(), Nan::New("y").ToLocalChecked(), Nan::New<Number>(cursorPoint.y));
		mouseObj->Set(Nan::GetCurrentContext(), Nan::New("isOutside").ToLocalChecked(), Nan::New<Boolean>(isOutside));
		mouseObj->Set(Nan::GetCurrentContext(), Nan::New("isWindowDrag").ToLocalChecked(), Nan::New<Boolean>(isWindowDrag));

		windowObj->Set(Nan::GetCurrentContext(), Nan::New("mouse").ToLocalChecked(), mouseObj);
		obj->Set(Nan::GetCurrentContext(), Nan::New("window").ToLocalChecked(), windowObj);

		Local<Value> argv[] = { obj };

		event_callback->Call(1, argv, async_resource);
	}

	uv_mutex_unlock(&lock);
}

NAN_METHOD(Mouse::New) {
	Nan::Callback* callback = new Nan::Callback(info[0].As<Function>());

	Mouse* mouse = new Mouse(callback);
	mouse->Wrap(info.This());

	info.GetReturnValue().Set(info.This());
}

NAN_METHOD(Mouse::Destroy) {
	Mouse* mouse = Nan::ObjectWrap::Unwrap<Mouse>(info.Holder());
	mouse->Stop();

	info.GetReturnValue().SetUndefined();
}

NAN_METHOD(Mouse::AddRef) {
	Mouse* mouse = ObjectWrap::Unwrap<Mouse>(info.Holder());
	uv_ref((uv_handle_t*) mouse->async);

	info.GetReturnValue().SetUndefined();
}

NAN_METHOD(Mouse::RemoveRef) {
	Mouse* mouse = ObjectWrap::Unwrap<Mouse>(info.Holder());
	uv_unref((uv_handle_t*) mouse->async);

	info.GetReturnValue().SetUndefined();
}

NODE_MODULE_INIT() {
	Mouse::Initialize(exports, module, context);
}
