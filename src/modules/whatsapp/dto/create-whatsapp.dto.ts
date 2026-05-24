import { IsNotEmpty, IsString } from "class-validator";

export class CreateWhatsappDto {
    @IsString()
    @IsNotEmpty()
    session!: string;
}


export class LoginWhatsappDto{
    @IsString()
    @IsNotEmpty()
    phone!:string
}