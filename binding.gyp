{
	"targets": [
		{
			"target_name": "win_mouse",
			"conditions": [
				["OS=='win'", {
					"sources": ["lib/mouse_hook.cc", "lib/mouse.cc"],
					"include_dirs": [
						"<!(node -e \"require('nan')\")"
					]
				}]
			]
		}
	]
}
