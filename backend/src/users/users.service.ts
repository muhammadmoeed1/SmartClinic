import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { DoctorProfile, Rating, Room, User } from '../entities';
import { Role, SPECIALTIES } from '../common/enums';
import { CreateDoctorDto, CreateReceptionistDto, CreateRoomDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(DoctorProfile) private profiles: Repository<DoctorProfile>,
    @InjectRepository(Room) private rooms: Repository<Room>,
    @InjectRepository(Rating) private ratings: Repository<Rating>,
  ) {}

  specialties(): string[] {
    return [...SPECIALTIES];
  }

  async listDoctors(specialty?: string) {
    const where = specialty ? { specialty } : {};
    const profiles = await this.profiles.find({
      where,
      relations: { user: true },
      order: { specialty: 'ASC' },
    });
    if (profiles.length === 0) return [];

    const stats = await this.ratings
      .createQueryBuilder('r')
      .select('r."doctorId"', 'doctorId')
      .addSelect('AVG(r.score)', 'avgRating')
      .addSelect('COUNT(*)', 'ratingCount')
      .where('r."doctorId" IN (:...ids)', { ids: profiles.map((p) => p.userId) })
      .groupBy('r."doctorId"')
      .getRawMany();
    const statsMap = new Map(stats.map((s) => [s.doctorId, s]));

    return profiles.map((p) => {
      const s = statsMap.get(p.userId);
      return {
        id: p.userId,
        fullName: p.user.fullName,
        specialty: p.specialty,
        bio: p.bio,
        avgRating: s ? Math.round(parseFloat(s.avgRating) * 10) / 10 : null,
        ratingCount: s ? parseInt(s.ratingCount, 10) : 0,
      };
    });
  }

  async createDoctor(dto: CreateDoctorDto) {
    if (await this.users.findOneBy({ email: dto.email.toLowerCase() })) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.users.save(
      this.users.create({
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        role: Role.DOCTOR,
      }),
    );
    await this.profiles.save(
      this.profiles.create({
        userId: user.id,
        specialty: dto.specialty,
        bio: dto.bio ?? null,
      }),
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      doctorProfile: { specialty: dto.specialty, bio: dto.bio ?? null },
    };
  }

  async createReceptionist(dto: CreateReceptionistDto) {
    if (await this.users.findOneBy({ email: dto.email.toLowerCase() })) {
      throw new ConflictException('Email already registered');
    }
    const user = await this.users.save(
      this.users.create({
        email: dto.email.toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 10),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        role: Role.RECEPTIONIST,
      }),
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    };
  }

  async listUsers(role?: Role) {
    const users = await this.users.find({
      where: role ? { role } : {},
      relations: { doctorProfile: true },
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      doctorProfile: u.doctorProfile
        ? { specialty: u.doctorProfile.specialty, bio: u.doctorProfile.bio }
        : undefined,
    }));
  }

  listRooms() {
    return this.rooms.find({ order: { branch: 'ASC', name: 'ASC' } });
  }

  createRoom(dto: CreateRoomDto) {
    return this.rooms.save(this.rooms.create(dto));
  }

  async findDoctorProfile(userId: string): Promise<DoctorProfile> {
    const profile = await this.profiles.findOne({
      where: { userId },
      relations: { user: true },
    });
    if (!profile) throw new NotFoundException('Doctor not found');
    return profile;
  }
}
