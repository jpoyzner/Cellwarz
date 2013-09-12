package com.poyznertech.cells;

import java.io.IOException;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

@WebServlet("/message")
public class Messenger extends HttpServlet {
	private static final long serialVersionUID = 1L;
	
	private static final String LOGIN_PARAM = "login";
	private static final String MESSAGE_PARAM = "message";
	
	@Override
	public void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		String login = request.getParameter(LOGIN_PARAM);
		
		((World)getServletContext().getAttribute(World.WORLD_ATTRIBUTE))
			.getZion()
			.getHardlines()
			.get(login)
			.getAvatar()
			.getCell()
			.postMessage(login + ": " + request.getParameter(MESSAGE_PARAM));
	}
}
