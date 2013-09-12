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

@WebServlet("/refresh")
public class Connector extends HttpServlet {
	private static final long serialVersionUID = 1L;
	
	public static final String LOGIN_PARAM = "login";
	public static final String JUMP_PARAM = "jump";
	public static final String SPRITES_KEY = "sprites";
	public static final String AVATARS_KEY = "avatars";
	public static final String TOOLS_KEY = "tools";
	public static final String IMAGE_PATHS_KEY = "imagePaths";
	
	@Override
	public void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
		World world = (World) getServletContext().getAttribute(World.WORLD_ATTRIBUTE);
		String login = request.getParameter(LOGIN_PARAM);
		boolean jump = Boolean.valueOf(request.getParameter(JUMP_PARAM));
		Session loginSession = world.getZion().getHardlines().get(login);
		
		Cell cell =
			loginSession == null || loginSession.unplugged() || jump ?
				world.getZion().getRandomEngine().getCell()
				: loginSession.getAvatar().getCell();
		
		cell.connect(login, jump);
		
		response.setContentType("application/json");
		PrintWriter out = response.getWriter();
		
		JSONObject jsonResponse = new JSONObject();
		jsonResponse.element(SPRITES_KEY, JSONGenerator.getSprites(cell.getCellData().getSprites(), false, null));
		
		JSONObject avatars = new JSONObject();
		for (Session session: world.getZion().getHardlines().values()) {
			if (!session.unplugged()) {
				avatars.element(session.getAvatar().getName(), session.getAvatar().getCellIndex());
			}
		}
		jsonResponse.element(AVATARS_KEY, avatars);
		
		jsonResponse.element(TOOLS_KEY, JSONGenerator.getTools(world.getZion().getHardlines().get(login).getAvatar()));
		
		JSONArray imagePaths = new JSONArray();
		for (String imagePath: cell.getCellData().getImagePaths()) {
			imagePaths.element(imagePath);
		}
		jsonResponse.element(IMAGE_PATHS_KEY, imagePaths);
		
		out.print(jsonResponse);
		out.flush();
		
		if (world.getZion().stale(login)) {
			world.getZion().loginNotStale(login);
		}
	}
}
