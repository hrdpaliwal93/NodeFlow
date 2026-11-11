import type { NextFunction , Request, Response} from "express";
import jwt, { type JwtPayload } from 'jsonwebtoken'

export default function Auth(req:Request,res:Response,next:NextFunction){
   try{
     const token = req.headers.authorization?.split(" ")[1]
    if(!token){
        res.status(401).json({message:"token not provided", success:false})
        return ;
    }
    const decodeddata = jwt.verify(token, `${process.env.jwt_secret}`) as JwtPayload
    if(!decodeddata || !decodeddata.id){
        res.status(401).json({message:"invalid or expired token", success:false}) 
        return 
    }
    req.id = decodeddata.id
    next();

   }catch(e:any){
    console.error(e.message)
    res.status(401).json({message:"invalid or expired token", success:false})
   }
}
