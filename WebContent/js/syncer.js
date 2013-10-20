function establishSocket(jump) {
	connection = new WebSocket("ws://" + document.location.host + "/Cellwarz/socketrefresh");
	
	connection.onopen = function() {
		connection.send(JSON.stringify({connect: true, login: loginName, jump: jump}));
	};
	
	connection.onmessage = function(e) {
		data = JSON.parse(e.data);	
		if (data.connect) {
			sprites = data.sprites;
			
			if (init) {
				avatars = data.avatars;
				tools = data.tools;
				
				imagePaths = data.imagePaths;
				for (var i = 0; i < imagePaths.length; i++) {	
					image = new Image();
					image.src = imagePaths[i];
					images[i] = image;
				}
				
				needsRefresh = false; //TODO: review this thing and the stale thing on server;
				
				//sync();
			}
		} else if (data.inactive) {
			drawStaleScreen();
		} else {
			render(JSON.parse(e.data));
		}
	};
	
	connection.onerror = function(error) {
		console.log(error);
		connection.close();
	};
	
	return connection;
}