import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateDoctorDto, CreateReceptionistDto, CreateRoomDto } from './dto';
import { Public, Roles } from '../common/decorators';
import { Role } from '../common/enums';

@ApiTags('doctors')
@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Public()
  @Get('doctors')
  @ApiOperation({ summary: 'List doctors (optionally by specialty)' })
  @ApiQuery({ name: 'specialty', required: false })
  listDoctors(@Query('specialty') specialty?: string) {
    return this.users.listDoctors(specialty);
  }

  @Public()
  @Get('specialties')
  @ApiOperation({ summary: 'List available specialties' })
  specialties() {
    return this.users.specialties();
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private users: UsersService) {}

  @Post('doctors')
  @ApiOperation({ summary: 'Create a doctor account (admin)' })
  createDoctor(@Body() dto: CreateDoctorDto) {
    return this.users.createDoctor(dto);
  }

  @Post('receptionists')
  @ApiOperation({ summary: 'Create a receptionist account (admin)' })
  createReceptionist(@Body() dto: CreateReceptionistDto) {
    return this.users.createReceptionist(dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'List users, optionally by role (admin)' })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  listUsers(@Query('role') role?: Role) {
    return this.users.listUsers(role);
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List rooms (admin)' })
  listRooms() {
    return this.users.listRooms();
  }

  @Post('rooms')
  @ApiOperation({ summary: 'Create a room (admin)' })
  createRoom(@Body() dto: CreateRoomDto) {
    return this.users.createRoom(dto);
  }
}
