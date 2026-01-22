import { Injectable, UnauthorizedException } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { UserService } from 'src/modules/user/user.service';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly userService: UserService,
    private readonly jwtService: JwtService
  ) {

  }
  async validate(loginDto: LoginDto) {
    const user = await this.userService.findOneByUsername(loginDto.username)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }
    if (user.password !== loginDto.password) {
      throw new UnauthorizedException('Invalid credentials')
    }
    return user;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validate(loginDto)
    const token = this.jwtService.sign({ id: user.id, role: user.role })
    return { token }
  }


  async register(username: string, password: string) {
    const user = await this.userService.create({
      username,
      password
    })
    return user
  }




}
