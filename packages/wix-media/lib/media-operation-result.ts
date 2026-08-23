export type MediaOperationStepId = 'wix-remote' | 'local-catalog';

export type MediaOperationStepStatus = 'success' | 'failed' | 'skipped';

export type MediaOperationStepResult = {
    id: MediaOperationStepId;
    status: MediaOperationStepStatus;
    detail: string;
};

export type MediaFolderCreateResult = {
    success: boolean;
    folderId?: string;
    folderPath: string[];
    steps: MediaOperationStepResult[];
    itemCount: number;
    emptyFolderCount: number;
};

export type MediaFileUploadResult = {
    success: boolean;
    fileName: string;
    fileId?: string;
    folderPath: string[];
    steps: MediaOperationStepResult[];
    itemCount: number;
};

const STEP_LABELS: Record<MediaOperationStepId, string> = {
    'wix-remote': 'Wix Media Manager',
    'local-catalog': 'Local project index',
};

export function stepLabel(stepId: MediaOperationStepId): string {
    return STEP_LABELS[stepId];
}

export function formatMediaOperationSteps(steps: MediaOperationStepResult[]): string {
    return steps
        .map((step) => {
            const statusWord =
                step.status === 'success'
                    ? 'succeeded'
                    : step.status === 'failed'
                      ? 'failed'
                      : 'skipped';
            return `${stepLabel(step.id)}: ${statusWord} — ${step.detail}`;
        })
        .join('\n');
}

export function formatMediaOperationMessage(
    headline: string,
    steps: MediaOperationStepResult[],
): string {
    return `${headline}\n\n${formatMediaOperationSteps(steps)}`;
}
