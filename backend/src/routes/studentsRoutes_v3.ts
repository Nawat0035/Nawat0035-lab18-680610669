import { Router, type Request, type Response } from "express";
import {
  zStudentPostBody,
  zStudentPutBody,
  zStudentId,
} from "../libs/zodValidators.js";

import type { Student, CustomRequest } from "../libs/types.js";

import { authenticateToken } from "../middlewares/authenMiddleware.ts";
import { checkRoleAdmin } from "../middlewares/checkRoleAdminDBMiddleware.ts";
import { checkRoles } from "../middlewares/checkRolesDBMiddleware.ts";

import { PrismaClient } from "../../generated/prisma/client.ts";

const prisma = new PrismaClient();
const router = Router();

// GET /api/v3/students
router.get(
  "/",
  authenticateToken,
  checkRoleAdmin,
  async (req: Request, res: Response) => {
    try {
      const students = await prisma.student.findMany({
        include: { files: true },
      });

      const program = req.query.program;

      if (program) {
        const filteredStudents = students.filter(
          (student: any) => student.program === program,
        );

        return res.json({
          success: true,
          data: filteredStudents,
        });
      }

      return res.json({
        success: true,
        data: students,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  },
);

// GET /api/v3/students/:studentId
router.get(
  "/:studentId",
  authenticateToken,
  checkRoles,
  async (req: CustomRequest, res: Response) => {
    try {
      const user = req.user;
      const studentId = req.params.studentId as string;

      const result = zStudentId.safeParse(studentId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      const student = await prisma.student.findUnique({
        where: { studentId },
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      if (
        user?.role === "STUDENT" &&
        student.studentId !== user.studentId
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      return res.json({
        success: true,
        data: student,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  },
);

// POST /api/v3/students
router.post(
  "/",
  authenticateToken,
  checkRoleAdmin,
  async (req: CustomRequest, res: Response) => {
    try {
      const body = req.body as Student;
      const result = zStudentPostBody.safeParse(body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      const {
        studentId,
        firstName,
        lastName,
        program,
        interests,
        emails,
      } = result.data;

      const existingStudent = await prisma.student.findUnique({
        where: { studentId },
      });

      if (existingStudent) {
        return res.status(400).json({
          success: false,
          message: "The StudentID is already taken.",
        });
      }

      const created = await prisma.student.create({
        data: {
          studentId,
          firstName,
          lastName,
          program,
          interests,
          emails,
        },
      });

      res.set("Link", `/api/v3/students/${created.studentId}`);

      return res.status(201).json({
        success: true,
        data: created,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  },
);

// PUT /api/v3/students
router.put(
  "/",
  authenticateToken,
  checkRoles,
  async (req: CustomRequest, res: Response) => {
    try {
      const result = zStudentPutBody.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: result.error.issues[0]?.message,
        });
      }

      const { studentId, ...fields } = result.data;

      const student = await prisma.student.findUnique({
        where: { studentId },
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      if (
        req.user?.role === "STUDENT" &&
        req.user.studentId !== studentId
      ) {
        return res.status(403).json({
          success: false,
          message: "Forbidden access",
        });
      }

      const data: Record<string, unknown> = {};

      for (const key of [
        "firstName",
        "lastName",
        "program",
        "interests",
        "emails",
      ] as const) {
        if (fields[key] !== undefined && fields[key] !== null) {
          data[key] = fields[key];
        }
      }

      const updated = await prisma.student.update({
        where: { studentId },
        data,
      });

      return res.status(200).json({
        success: true,
        message: "Student updated successfully",
        data: updated,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  },
);

// DELETE /api/v3/students — ADMIN only
router.delete(
  "/",
  authenticateToken,
  checkRoleAdmin,
  async (req: Request, res: Response) => {
    try {
      const parsed = zStudentId.safeParse(req.body?.studentId);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: parsed.error.issues[0]?.message,
        });
      }

      const studentId = parsed.data;

      const student = await prisma.student.findUnique({
        where: { studentId },
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student does not exists",
        });
      }

      await prisma.$transaction([
        prisma.enrollment.deleteMany({
          where: { studentId },
        }),
        prisma.file.deleteMany({
          where: { studentId },
        }),
        prisma.student.delete({
          where: { studentId },
        }),
      ]);

      return res.status(200).json({
        success: true,
        message: "Student deleted successfully",
        data: student,
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: "Something is wrong, please try again",
        error: err,
      });
    }
  },
);

export default router;