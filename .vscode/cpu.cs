using System;
using System.Collections.Generic;

class CPU_ALU
{
    // Memory and registers
    private static int[] Memory = new int[1024];
    private static int[] Registers = new int[32];
    private static int ProgramCounter = 0;
    private static int InstructionRegister = 0;

    // ALU operations enumeration based on RISC-V
    enum ALUOperation
    {
        ADD,
        ADDI,
        XORI,
        AND,
        BEQ,
        LB,
        SB
    }

    // Method to fetch the next instruction
    private static int FetchInstruction()
    {
        InstructionRegister = Memory[ProgramCounter / 4]; // Fetch instruction (4-byte aligned)
        ProgramCounter += 4;
        return InstructionRegister;
    }

    // Method to decode and execute an instruction
    public static void ExecuteInstruction(int binaryInstruction)
    {
        // Decode fields based on RISC-V format
        int opcode = binaryInstruction & 0x7F; // Bits 0-6
        int rd = (binaryInstruction >> 7) & 0x1F; // Bits 7-11
        int funct3 = (binaryInstruction >> 12) & 0x7; // Bits 12-14
        int rs1 = (binaryInstruction >> 15) & 0x1F; // Bits 15-19
        int rs2 = (binaryInstruction >> 20) & 0x1F; // Bits 20-24
        int imm = (binaryInstruction >> 20) & 0xFFF; // Bits 20-31 (immediate)

        // Sign-extend immediate value
        if ((imm & 0x800) != 0) // Check sign bit (bit 11 of imm)
        {
            imm |= 0xFFFFF000; // Extend sign to 32 bits
        }

        switch (opcode)
        {
            case 0x33: // R-Type (e.g., ADD)
                if (funct3 == 0x0) // ADD
                {
                    Console.WriteLine("Operation: ADD");
                    PerformAdd(rs1, rs2, rd);
                }
                else
                {
                    Console.WriteLine("Unsupported R-Type operation.");
                }
                break;

            case 0x13: // I-Type (e.g., ADDI)
                if (funct3 == 0x0) // ADDI
                {
                    Console.WriteLine("Operation: ADDI");
                    PerformAddImmediate(rs1, imm, rd);
                }
                else
                {
                    Console.WriteLine("Unsupported I-Type operation.");
                }
                break;

            case 0x63: // Branch instructions (e.g., BEQ)
                if (funct3 == 0x0) // BEQ
                {
                    Console.WriteLine("Operation: BEQ");
                    PerformBranch(rs1, rs2, imm);
                }
                else
                {
                    Console.WriteLine("Unsupported Branch operation.");
                }
                break;

            default:
                Console.WriteLine("Unknown operation code.");
                break;
        }
    }

    // ALU operations implementation
    private static void PerformAdd(int rs1, int rs2, int rd)
    {
        Registers[rd] = Registers[rs1] + Registers[rs2];
        Console.WriteLine($"ADD -> x[{rd}] = x[{rs1}]({Registers[rs1]}) + x[{rs2}]({Registers[rs2]}) = {Registers[rd]}");
    }

    private static void PerformAddImmediate(int rs1, int imm, int rd)
    {
        Registers[rd] = Registers[rs1] + imm;
        Console.WriteLine($"ADDI -> x[{rd}] = x[{rs1}]({Registers[rs1]}) + imm({imm}) = {Registers[rd]}");
    }

    private static void PerformBranch(int rs1, int rs2, int offset)
    {
        if (Registers[rs1] == Registers[rs2])
        {
            ProgramCounter += offset << 1; // Offset is shifted left by 1 (to multiply by 2)
            Console.WriteLine($"BEQ -> Branch taken to address: {ProgramCounter}");
        }
        else
        {
            Console.WriteLine("BEQ -> Branch not taken.");
        }
    }

    public static void Main(string[] args)
    {
        // Example RISC-V instructions (in 32-bit binary format)
        Memory[0] = 0b00000000010100001000000010010011; // ADDI x1, x2, 5
        Memory[1] = 0b00000000000100001000000110110011; // ADD x3, x2, x1
        Memory[2] = 0b00000000000100001000000001100011; // BEQ x2, x1, 4

        while (ProgramCounter / 4 < Memory.Length && Memory[ProgramCounter / 4] != 0)
        {
            int fetchedInstruction = FetchInstruction();
            ExecuteInstruction(fetchedInstruction);
        }
    }
}
