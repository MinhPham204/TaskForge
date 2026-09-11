import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SIDE_MENU_DATA } from "../../utils/data";
import { useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import useUserAuth from '../../hooks/useUserAuth.jsx';


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
    <div className="w-64 h-[calc(100vh-61px)] bg-white border-r border-gray-200/50 sticky top-[61px] z-20 flex flex-col justify-between overflow-y-auto">
      <div>
        {/* User info */}
        <div className="flex flex-col items-center justify-center mb-6 pt-5 px-4 text-center">
          <div className="relative">
            <img
              src={user?.profileImageUrl || "/default-avatar.png"}
              alt="Profile"
              className="w-16 h-16 bg-slate-200 rounded-full object-cover border-2 border-white shadow-xs"
            />
          </div>

          {getRoleBadge()}

          <h5 className="text-gray-950 font-semibold text-sm leading-5 mt-2.5 truncate max-w-full">
            {user?.name || ""}
          </h5>

          <p className="text-[11px] text-gray-500 truncate max-w-full mt-0.5">{user?.email || ""}</p>
        </div>

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
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
                onClick={() => handleClick(item.path)}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-gray-400"}`} />
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
