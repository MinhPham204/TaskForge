const configuredApiUrl = import.meta.env?.VITE_API_URL?.trim();
export const BASE_URL = (configuredApiUrl || "http://localhost:8001").replace(/\/$/, "");

export const API_PATHS = {
    AUTH: {
        REGISTER: "/api/auth/register",
        LOGIN: "/api/auth/login",
        REFRESH_TOKEN: "/api/auth/refresh",
        LOGOUT: "/api/auth/logout",
        GET_PROFILE: "/api/auth/me",
        UPDATE_PROFILE: "/api/auth/profile",
        VERIFY_OTP: "/api/auth/verify-otp",
        SET_PASSWORD: "/api/auth/set-password",
        SIGNUP: "/api/auth/set-password",
        REQUEST_PASSWORD_RESET: "/api/auth/forgot-password",
        RESET_PASSWORD: "/api/auth/reset-password",
        CHANGE_PASSWORD: "/api/auth/change-password",
        MY_ORGANIZATIONS: "/api/auth/my-organizations",
    },

    TASKS: {
        MY: "/api/tasks/my",
        APPROVAL_QUEUE: "/api/tasks/approval-queue",
    },

    TEAM: {
        CREATE_TEAM: "/api/teams",
        LIST: "/api/teams",
        GET_BY_ID: (teamId) => `/api/teams/${teamId}`,
        CREATE: "/api/teams",
        UPDATE: (teamId) => `/api/teams/${teamId}`,
        ARCHIVE: (teamId) => `/api/teams/${teamId}/archive`,
        ADD_MEMBER: (teamId) => `/api/teams/${teamId}/members`,
        REMOVE_MEMBER_RELATION: (teamId, membershipId) => `/api/teams/${teamId}/members/${membershipId}`,
    },

    PROJECTS: {
        LIST: "/api/projects",
        CREATE: "/api/projects",
        GET_BY_ID: (projectId) => `/api/projects/${projectId}`,
        UPDATE: (projectId) => `/api/projects/${projectId}`,
        LIFECYCLE: (projectId, command) => `/api/projects/${projectId}/${command}`,
        PARTICIPANTS: {
            TEAMS: (projectId) => `/api/projects/${projectId}/teams`,
            REMOVE_TEAM: (projectId, teamId) => `/api/projects/${projectId}/teams/${teamId}`,
            MEMBERS: (projectId) => `/api/projects/${projectId}/members`,
            REMOVE_MEMBER: (projectId, membershipId) => `/api/projects/${projectId}/members/${membershipId}`,
        },
        STATUSES: {
            LIST: (projectId) => `/api/projects/${projectId}/statuses`,
            CREATE: (projectId) => `/api/projects/${projectId}/statuses`,
            RENAME: (projectId, statusId) => `/api/projects/${projectId}/statuses/${statusId}`,
            REORDER: (projectId, statusId) => `/api/projects/${projectId}/statuses/${statusId}/reorder`,
            ARCHIVE: (projectId, statusId) => `/api/projects/${projectId}/statuses/${statusId}/archive`,
        },
        MODULES: {
            LIST: (projectId) => `/api/projects/${projectId}/modules`,
            SET: (projectId) => `/api/projects/${projectId}/modules`,
        },
        TASKS: {
            LIST: (projectId) => `/api/projects/${projectId}/tasks`,
            BOARD: (projectId) => `/api/projects/${projectId}/tasks/board`,
            OVERVIEW: (projectId) => `/api/projects/${projectId}/tasks/overview`,
            REPORT: (projectId) => `/api/projects/${projectId}/tasks/report`,
            EXPORT: (projectId) => `/api/projects/${projectId}/tasks/export`,
            GET_BY_ID: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}`,
            CREATE: (projectId) => `/api/projects/${projectId}/tasks`,
            UPDATE: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}`,
            ARCHIVE: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}`,
            STATUS: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/status`,
            MANUAL_PROGRESS: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/manual-progress`,
            CHECKLIST_ITEMS: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/checklist-items`,
            CHECKLIST_ITEM: (projectId, taskId, itemId) => `/api/projects/${projectId}/tasks/${taskId}/checklist-items/${itemId}`,
            COMMENTS: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/comments`,
            COMMENT: (projectId, taskId, commentId) => `/api/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
            ASSIGNEES: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/assignees`,
            ASSIGNEE: (projectId, taskId, projectMembershipId) => `/api/projects/${projectId}/tasks/${taskId}/assignees/${projectMembershipId}`,
            APPROVAL: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/approval`,
            APPROVAL_REQUESTS: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/approval-requests`,
            APPROVAL_ACTION: (projectId, taskId, action) => `/api/projects/${projectId}/tasks/${taskId}/approval-requests/${action}`,
            ATTACHMENTS: {
                LIST: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/attachments`,
                UPLOAD: (projectId, taskId) => `/api/projects/${projectId}/tasks/${taskId}/attachments`,
                DOWNLOAD: (projectId, taskId, attachmentId) => `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`,
                UNLINK: (projectId, taskId, attachmentId) => `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`,
            },
        },
        ACTIVITIES: (projectId) => `/api/projects/${projectId}/activities`,
        FILES: {
            LIST: (projectId) => `/api/projects/${projectId}/files`,
            UPLOAD: (projectId) => `/api/projects/${projectId}/files`,
            DOWNLOAD: (projectId, fileId) => `/api/projects/${projectId}/files/${fileId}/download`,
            REMOVE: (projectId, fileId) => `/api/projects/${projectId}/files/${fileId}`,
        },
        MILESTONES: {
            LIST: (projectId) => `/api/projects/${projectId}/milestones`,
            CREATE: (projectId) => `/api/projects/${projectId}/milestones`,
            UPDATE: (projectId, milestoneId) => `/api/projects/${projectId}/milestones/${milestoneId}`,
            CLOSE: (projectId, milestoneId) => `/api/projects/${projectId}/milestones/${milestoneId}/close`,
            REOPEN: (projectId, milestoneId) => `/api/projects/${projectId}/milestones/${milestoneId}/reopen`,
        },
        DOCUMENTS: {
            LIST: (projectId) => `/api/projects/${projectId}/documents`,
            GET: (projectId, documentId) => `/api/projects/${projectId}/documents/${documentId}`,
            CREATE: (projectId) => `/api/projects/${projectId}/documents`,
            UPDATE: (projectId, documentId) => `/api/projects/${projectId}/documents/${documentId}`,
            ARCHIVE: (projectId, documentId) => `/api/projects/${projectId}/documents/${documentId}`,
        },
        RISKS: {
            LIST: (projectId) => `/api/projects/${projectId}/risks`,
            CREATE: (projectId) => `/api/projects/${projectId}/risks`,
            UPDATE: (projectId, riskId) => `/api/projects/${projectId}/risks/${riskId}`,
            ARCHIVE: (projectId, riskId) => `/api/projects/${projectId}/risks/${riskId}`,
            LINK_TASK: (projectId, riskId, taskId) => `/api/projects/${projectId}/risks/${riskId}/tasks/${taskId}`,
        },
    },

    NOTIFICATIONS: {
        LIST: "/api/notifications",
        MARK_READ: (notificationId) => `/api/notifications/${notificationId}/read`,
        MARK_UNREAD: (notificationId) => `/api/notifications/${notificationId}/unread`,
    },

    ORGANIZATIONS: {
        CREATE_ORG: "/api/organizations",
    },

    INVITATIONS: {
        LIST: "/api/invitations",
        ACCEPT: "/api/invitations/accept",
    },

    IMAGE: {
        UPLOAD_IMAGE: "/api/auth/upload-image",
    },
};
