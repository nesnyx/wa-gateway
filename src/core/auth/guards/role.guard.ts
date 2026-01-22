import {
    Injectable,
    CanActivate,
    ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) { }
    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredRoles) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const response: Response = context.switchToHttp().getResponse();
        const user = request.user;

        if (!user || !user.role) {
            response
                .status(403)
                .json({
                    success: false,
                    message: 'Forbidden',
                });
            return false;
        }
        const hasAccess = requiredRoles.includes(user.role);
        if (!hasAccess) {
            response
                .status(403)
                .json({
                    success: false,
                    message: 'Forbidden',
                });
            return false;
        }


        return true;
    }
}