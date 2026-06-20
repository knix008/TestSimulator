import { NextFunction, Request, Response } from "express";

type Handler = (req: Request, res: Response) => Promise<void>;

export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}
