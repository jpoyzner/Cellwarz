$(document).keydown(function(event) {
	if (event.keyCode == 37 || event.keyCode == 38 || event.keyCode == 39 || event.keyCode == 40) {
		event.preventDefault();
	} else if (event.keyCode == 32 || (event.keyCode > 57 && event.keyCode < 91)) { //letters
		text = text + String.fromCharCode(event.keyCode); 
	} else if (event.keyCode == 8) { //backspace
		var input = event.srcElement || event.target;
        if ((input.tagName.toUpperCase() === 'INPUT' && (input.type.toUpperCase() === 'TEXT' || input.type.toUpperCase() === 'PASSWORD')) 
            || input.tagName.toUpperCase() === 'TEXTAREA') {
            
        	if (input.readOnly || input.disabled) {
            	event.preventDefault();
            }
        }
        else {
        	event.preventDefault();
        }
		
		if (text.length > 0) {
			text = text.substring(0, text.length - 1);
		}
	} else if (event.keyCode == 13) { //enter
		if (text.length > 0) {
			connection.send(JSON.stringify({message: text}));
			text = "";
		}
	}
	
	connection.send(JSON.stringify({key: event.keyCode, down: true})); //instead of down, use keyup or keydown param
});

$(document).keyup(function(event) {
	connection.send(JSON.stringify({key: event.keyCode, down: false}));
});

//canvas.onclick=function(event) {
   	//cell.click(event.clientX - 48, event.clientY - 48); //window x and y value (not canvas x and y)
//};