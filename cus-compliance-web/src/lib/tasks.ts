export const TASK_MAX_LENGTH = 300;
export const TASK_LIMIT = 100;

export type TaskLean = {
  _id: unknown;
  text?: string;
  urgent?: boolean;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export function publicTask(d: TaskLean) {
  return {
    id: String(d._id),
    text: d.text || "",
    urgent: Boolean(d.urgent),
    createdBy: d.createdBy || "",
    updatedBy: d.updatedBy || "",
    createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
    updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : null,
  };
}

export type CrmTask = ReturnType<typeof publicTask>;
