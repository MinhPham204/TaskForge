import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SIDE_MENU_DATA } from "../../utils/data";
import { useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import useUserAuth from '../../hooks/useUserAuth.jsx';
import Avatar from '../Avatar.jsx';


const SideMenu = ({ activeMenu, onClose }) => {
  const { user, role } = useUserAuth();
  const dispatch = useDispatch();
  const [sideMenuData, setSideMenuData] = useState([]);
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;

  const handleClick = (route) => {
    if (onClose) {
      onClose();
    }
    if (route === "logout") {
      handleLogout();
      return;
    }
    navigate(route);
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login");
  };

  useEffect(() => {
    if (user) {
      setSideMenuData(SIDE_MENU_DATA);
    }
  }, [user]);

  const getRoleBadge = () => {
    if (role === "owner") {
      return (
        <span className="text-[10px] font-semibold tracking-wide uppercase text-white bg-primary px-2.5 py-0.5 rounded-full mt-1.5 shadow-xs">
          Owner
        </span>
      );
    }
    if (role === "admin") {
      return (
        <span className="text-[10px] font-semibold tracking-wide uppercase text-white bg-blue-600 px-2.5 py-0.5 rounded-full mt-1.5 shadow-xs">
          Admin
        </span>
      );
    }
    if (role === "member") {
      return (
        <span className="text-[10px] font-semibold tracking-wide uppercase text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full mt-1.5">
          Member
        </span>
      );
    }
    return null;
  };

  return (
    <div className="sticky top-[61px] z-20 flex h-[calc(100vh-61px)] w-64 flex-col justify-between overflow-y-auto border-r border-border bg-surface">
      <div>
        {/* User info */}
        <button
          type="button"
          onClick={() => handleClick('/account')}
          className="mb-6 flex w-full flex-col items-center justify-center rounded-lg px-4 pt-5 text-center transition-colors hover:bg-surface-muted"
          aria-label="Open Account Center"
        >
          <div className="relative">
            <Avatar src={user?.profileImageUrl} name={user?.name} alt="Profile" className="h-16 w-16 border-2 border-surface shadow-xs" />
          </div>

          {getRoleBadge()}

          <h5 className="mt-2.5 max-w-full truncate text-sm font-semibold leading-5 text-content">
            {user?.name || ""}
          </h5>

          <p className="mt-0.5 max-w-full truncate text-[11px] text-content-muted">{user?.email || ""}</p>
        </button>

        {/* Menu items */}
        <div className="px-3 space-y-1">
          {sideMenuData.map((item, index) => {
            const isActive =
              item.path !== "logout" &&
              (activeMenu
                ? activeMenu === item.path
                : currentPath === item.path || currentPath.startsWith(item.path + "/"));

            return (
              <button
                key={`menu_${index}`}
                className={`w-full flex items-center gap-3 text-sm font-medium py-2.5 px-3 rounded-lg cursor-pointer transition-colors ${
                  isActive
                    ? "text-primary bg-blue-50/80 font-semibold shadow-xs"
                    : "text-content-muted hover:bg-surface-muted hover:text-content"
                }`}
                onClick={() => handleClick(item.path)}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-content-muted"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SideMenu;
