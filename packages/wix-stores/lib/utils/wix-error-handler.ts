import { RenderPipeline } from '@jay-framework/fullstack-component';

export function handleError<
    TargetVS extends object = object,
    TargetCF extends object = Record<string, never>,
>(error: Error): RenderPipeline<any, TargetVS, TargetCF> {
    const errorCode = error['details']?.applicationError?.code;
    if (!!errorCode) {
        const requestId = error['details']?.requestId;
        if (errorCode === 'NOT_FOUND') {
            return RenderPipeline.for<TargetVS, TargetCF>().clientError(404, 'not found');
        }
        return RenderPipeline.for<TargetVS, TargetCF>().serverError(
            500,
            'Wix SDK Error: ' + error.message,
        );
    } else return RenderPipeline.for<TargetVS, TargetCF>().serverError(500, 'unknown server error');
}
