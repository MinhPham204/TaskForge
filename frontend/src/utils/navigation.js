export const getNotificationDestination = (notification) => {
  const target = notification?.target;
  if (!target) return null;

  if (target.resourceType === 'PROJECT' && target.resourceId) {
    return `/projects/${target.resourceId}`;
  }

  if (target.resourceType === 'TASK' && target.projectId && target.resourceId) {
    return `/projects/${target.projectId}?tab=tasks&task=${target.resourceId}`;
  }

  if (target.resourceType === 'TEAM' && target.resourceId) {
    return `/teams/${target.resourceId}`;
  }

  return null;
};

export const getResourceDestination = (kind, id, projectId = null) => {
  if (kind === 'PROJECT' && id) {
    return `/projects/${id}`;
  }
  if (kind === 'TASK' && id && projectId) {
    return `/projects/${projectId}?tab=tasks&task=${id}`;
  }
  if (kind === 'TEAM' && id) {
    return `/teams/${id}`;
  }
  return null;
};

export const getRecentStorageKey = (userId, organizationId) => {
  const cleanUserId = typeof userId === 'string' ? userId.trim() : '';
  const cleanOrgId = typeof organizationId === 'string' ? organizationId.trim() : '';
  if (!cleanUserId || !cleanOrgId) return null;
  return `taskforge:recent:${cleanUserId}:${cleanOrgId}`;
};

export const getRecentDestinations = (userId, organizationId) => {
  const key = getRecentStorageKey(userId, organizationId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

export const addRecentDestination = (userId, organizationId, item) => {
  const key = getRecentStorageKey(userId, organizationId);
  if (!key || !item?.kind || !item?.id || !item?.title) return [];
  try {
    const existing = getRecentDestinations(userId, organizationId);
    const filtered = existing.filter(
      (r) => !(r.kind === item.kind && r.id === item.id)
    );
    const updated = [
      {
        kind: item.kind,
        id: item.id,
        projectId: item.projectId || null,
        title: item.title,
        description: item.description || null,
        updatedAt: item.updatedAt || new Date().toISOString(),
        timestamp: Date.now(),
      },
      ...filtered,
    ].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch (_) {
    return [];
  }
};

export const clearRecentDestinations = (userId, organizationId) => {
  const key = getRecentStorageKey(userId, organizationId);
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch (_) {
    // ignore storage error
  }
};
