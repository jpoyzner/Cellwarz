package com.poyznertech.cells;

import java.io.IOException;

import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServletRequest;

import org.apache.catalina.websocket.StreamInbound;
import org.apache.catalina.websocket.WebSocketServlet;

@WebServlet("/socketrefresh")
public class WebSocketConnector extends WebSocketServlet {
	private static final long serialVersionUID = 1L;

	@Override
	protected StreamInbound createWebSocketInbound(String protocol, HttpServletRequest request) {
		try {
			return new SocketHub((World) getServletContext().getAttribute(World.WORLD_ATTRIBUTE));
		} catch (IOException e) {
			e.printStackTrace();
		}
		
		return null;
	}
}
