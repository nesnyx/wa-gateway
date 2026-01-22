import { IsNotEmpty, IsString } from "class-validator";

export class CreateWhatsappDto {

    @IsString()
    @IsNotEmpty()
    session: string;
}
