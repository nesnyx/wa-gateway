import { IsNotEmpty } from "class-validator";

export class SendMessageDto {
    @IsNotEmpty()
    sessionId: string;

    @IsNotEmpty()
    target: string;

    @IsNotEmpty()
    message: string;
}