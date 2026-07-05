# Processing Toolbar New Task Guard

## Intent

FrameQ should prevent accidental task termination when a video task is already running. The toolbar `RotateCcw` action is a new-task/reset action, not the cancel action.

## Scope

- While the workflow is `video_extracting`, `video_transcribing`, or `insights_generating`, the toolbar new-task button is disabled.
- The task monitor cancel button remains the only UI entry that terminates the active worker process.
- Completed, partial-completed, failed, and waiting-input states keep the toolbar new-task action available.
- This change does not add background tasks, task recovery, multi-task queues, or worker lifecycle API changes.

## Acceptance Criteria

- A running task cannot be reset or cancelled through the toolbar new-task button.
- The toolbar button exposes clear disabled copy such as `处理中不可开始新任务，请先取消或等待完成`.
- The existing task monitor cancel action still terminates the worker and returns to input with the submitted URL.
- The toolbar new-task button is enabled again after the task reaches completed, partial-completed, failed, or waiting-input state.
