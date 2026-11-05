import { loadEnv } from 'vite';
import path from 'node:path';
import { checkpointMiddleware, createCheckpointService, isLocalRequest } from './github-checkpoints.mjs';
import { chatMiddleware, createDocChat } from './doc-chat.mjs';
import { createDocumentMirror } from './local-documents.mjs';

export function checkpointPlugin(mode) {
  const env=loadEnv(mode,process.cwd(),'PREPWISE_');
  // PREPWISE_DATA_DIR keeps a test copy of the app away from the real files.
  const data=env.PREPWISE_DATA_DIR;
  const checkpoints=data ? path.join(data,'checkpoints') : path.join(process.cwd(),'.prepwise','checkpoints');
  const service=createCheckpointService({repo:env.PREPWISE_GITHUB_REPO,token:env.PREPWISE_GITHUB_TOKEN,directory:checkpoints});
  const documents=createDocumentMirror({directory:data ? path.join(data,'documents') : path.join(process.cwd(),'documents'),uploadsDirectory:path.join(checkpoints,'uploads')});
  const middleware=checkpointMiddleware(service,documents);
  // PREPWISE_CLAUDE_BIN lets tests run the chat without using the plan.
  const chat=chatMiddleware(createDocChat({directory:data ? path.join(data,'chat') : path.join(process.cwd(),'.prepwise','chat'),uploadsDirectory:path.join(checkpoints,'uploads'),command:env.PREPWISE_CLAUDE_BIN || 'claude'}),isLocalRequest);
  return {name:'prepwise-local-checkpoints',configureServer(server){server.middlewares.use(chat);server.middlewares.use(middleware);},configurePreviewServer(server){server.middlewares.use(chat);server.middlewares.use(middleware);}};
}
