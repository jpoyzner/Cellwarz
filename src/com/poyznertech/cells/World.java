package com.poyznertech.cells;

import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;
import javax.servlet.annotation.WebListener;
import javax.servlet.http.HttpServlet;

@WebListener
public class World extends HttpServlet implements ServletContextListener {
	private static final long serialVersionUID = 1L;

	static final String WORLD_ATTRIBUTE = "world";

	private Physics physics;
	private Zion zion;
	
	@Override
	public void contextInitialized(ServletContextEvent event) {
		physics = new Physics();
		zion = new Zion(this);
		
		event.getServletContext().setAttribute(WORLD_ATTRIBUTE, this);
	}
	
	public Physics getPhysics() {
		return physics;
	}

	public Zion getZion() {
		return zion;
	}

	@Override
	public void contextDestroyed(ServletContextEvent arg0) {}
}
