import {
    LuClipboardCheck,
    LuLogOut,
    LuUsersRound,
    LuFolderKanban,
    LuBell,
    LuLayoutDashboard,
    LuUserRound,
    LuSettings,
    LuBuilding2,
} from "react-icons/lu";

export const SIDE_MENU_DATA = [
    {
        id: "01",
        label: "Dashboard",
        icon: LuLayoutDashboard,
        path: "/dashboard",
    },
    {
        id: "02",
        label: "Projects",
        icon: LuFolderKanban,
        path: "/projects",
    },
    {
        id: "03",
        label: "Teams",
        icon: LuUsersRound,
        path: "/teams",
    },
    {
        id: "04",
        label: "My Tasks",
        icon: LuClipboardCheck,
        path: "/tasks/my",
    },
    {
        id: "05",
        label: "Inbox",
        icon: LuBell,
        path: "/inbox",
    },
    {
        id: "06",
        label: "Account",
        icon: LuUserRound,
        path: "/account",
    },
    {
        id: "07",
        label: "Personal Settings",
        icon: LuSettings,
        path: "/settings/personal",
    },
    {
        id: "08",
        label: "Workspace Settings",
        icon: LuBuilding2,
        path: "/settings/workspace",
    },
    {
        id: "09",
        label: "Logout",
        icon: LuLogOut,
        path: "logout",
    },
];
