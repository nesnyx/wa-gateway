import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";


export enum Status {
    PENDING = 'PENDING',
    CONNECTED = 'CONNECTED',
    DISCONNECTED = 'DISCONNECTED',
}

@Entity("session_whatsapp")
export class Whatsapp {

    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column()
    session: string;

    @Column({ nullable: true })
    session_qr: string;

    @Column({ nullable: true })
    phone_number: string;

    @Column({ default: Status.PENDING })
    status: string

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

}
