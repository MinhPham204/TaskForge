import {
    LuClipboardCheck,
    LuShieldCheck,
    LuLogOut,
    LuUsersRound,
    LuFolderKanban,
    LuBell,
} from "react-icons/lu";

export const SIDE_MENU_DATA = [
    {
        id: "01",
        label: "Projects",
        icon: LuFolderKanban,
        path: "/projects",
    },
    {
        id: "02",
        label: "Teams",
        icon: LuUsersRound,
        path: "/teams",
    },
    {
        id: "03",
        label: "My Tasks",
        icon: LuClipboardCheck,
        path: "/tasks/my",
    },
    {
        id: "04",
        label: "Inbox",
        icon: LuBell,
        path: "/inbox",
    },
    {
        id: "05",
        label: "Approval Queue",
        icon: LuShieldCheck,
        path: "/tasks/approval-queue",
    },
    {
        id: "06",
        label: "Logout",
        icon: LuLogOut,
        path: "logout",
    },
];
