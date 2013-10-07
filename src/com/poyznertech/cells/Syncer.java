package com.poyznertech.cells;

import java.io.IOException;
import java.io.PrintWriter;

import javax.servlet.ServletException;
import javax.servlet.annotation.WebServlet;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import net.sf.json.JSONArray;
import net.sf.json.JSONObject;

@WebServlet("/sync")
public class Syncer extends HttpServlet {
	private static final long serialVersionUID = 1L;
	
	private static final String LOGIN_PARAM = "login";
	private static final String KEYDOWNS_PARAM = "keydowns";
	private static final String KEYUPS_PARAM = "keyups";
	private static final String MESSAGE_KEY = "message";
	
	@Override
	@SuppressWarnings({ "unchecked" })
	public void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		World world = (World) getServletContext().getAttribute(World.WORLD_ATTRIBUTE);
		String login = request.getParameter(LOGIN_PARAM);
		Session session = world.getZion().getHardlines().get(login);
		
//		session.getUI().reactTo(
//			JSONArray.toCollection(JSONArray.fromObject(request.getParameter(KEYDOWNS_PARAM)), Integer.class),
//			JSONArray.toCollection(JSONArray.fromObject(request.getParameter(KEYUPS_PARAM)), Integer.class));
		
		response.setContentType("application/json");
		PrintWriter out = response.getWriter();
		
		Cell cell = session.getAvatar().getCell();
		
		JSONObject jsonObject = world.getZion().stale(login) ?
			new JSONObject()
			: JSONGenerator.getSprites(cell.getEngine().getRedrawSprites(), true, session.getAvatar());
		
		if (cell.hasNewMessage()) {
			jsonObject.element(MESSAGE_KEY, cell.getMessage());
		}
		
		out.print(jsonObject);
		out.flush();
	}
}