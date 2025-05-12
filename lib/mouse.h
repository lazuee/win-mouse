#ifndef _MOUSE_H
#define _MOUSE_H

#include <nan.h>
#include <atomic>

#include "mouse_hook.h"

using namespace v8;

struct MouseEvent {
	POINT point;
	WPARAM type;
};

const unsigned int BUFFER_SIZE = 10;

class Mouse : public Nan::ObjectWrap {
	public:
		static void Initialize(Local<Object> exports, Local<Value> module, Local<Context> context);
		static Nan::Persistent<Function> constructor;

		void Stop();
		void HandleEvent(WPARAM, POINT);
		void HandleSend();

	private:
		std::atomic<bool> leftPressed{false};
		std::atomic<bool> rightPressed{false};
		std::atomic<bool> middlePressed{false};

		MouseEvent* eventBuffer[BUFFER_SIZE];
		std::atomic<unsigned int> readIndex{0};
		std::atomic<unsigned int> writeIndex{0};
		std::atomic<bool> stopped{false};

		MouseHookRef hook_ref;
		Nan::Callback* event_callback = nullptr;
		Nan::AsyncResource* async_resource = nullptr;
    HWND hwnd = nullptr;
    bool oldIsWindowDrag = false;
    RECT oldRect = {0};
		uv_async_t* async = nullptr;
		uv_mutex_t lock;

		explicit Mouse(Nan::Callback*);
		~Mouse();

		static NAN_METHOD(New);
		static NAN_METHOD(Destroy);
		static NAN_METHOD(AddRef);
		static NAN_METHOD(RemoveRef);
};

#endif
