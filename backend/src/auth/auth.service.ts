import {
  ConflictException, ForbiddenException, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities';
import { Role } from '../common/enums';
import { LoginDto, RegisterDto } from './dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    private jwt: JwtService,
  ) {}

  private async issueTokens(user: User): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: (process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me').trim(),
      expiresIn: (process.env.JWT_ACCESS_TTL || '900s').trim(),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: (process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me').trim(),
      expiresIn: (process.env.JWT_REFRESH_TTL || '7d').trim(),
    });
    await this.users.update(user.id, {
      refreshTokenHash: await bcrypt.hash(refreshToken, 10),
    });
    return { accessToken, refreshToken };
  }

  toDto(user: User) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      doctorProfile: user.doctorProfile
        ? { specialty: user.doctorProfile.specialty, bio: user.doctorProfile.bio }
        : undefined,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.users.findOneBy({ email: dto.email.toLowerCase() });
    if (existing) throw new ConflictException('Email already registered');
    const user = await this.users.save(
      this.users.create({
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        role: Role.PATIENT,
      }),
    );
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toDto(user) };
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: { doctorProfile: true },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const tokens = await this.issueTokens(user);
    return { ...tokens, user: this.toDto(user) };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: (process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me').trim(),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || !user.refreshTokenHash) throw new ForbiddenException('Access denied');
    const matches = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!matches) throw new ForbiddenException('Access denied');
    return this.issueTokens(user);
  }

  async me(userId: string) {
    const user = await this.users.findOne({
      where: { id: userId },
      relations: { doctorProfile: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.toDto(user);
  }
}
